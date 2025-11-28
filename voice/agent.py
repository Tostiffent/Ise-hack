from __future__ import annotations

import asyncio
import logging
from dotenv import load_dotenv
import json
import os
from typing import Any

from livekit import rtc, api
from livekit.agents import (
    AgentSession,
    Agent,
    JobContext,
    function_tool,
    RunContext,
    get_job_context,
    cli,
    WorkerOptions,
    RoomInputOptions,
)
from livekit.plugins import (
    deepgram,
    groq,
    cartesia,
    silero,
    noise_cancellation,  # noqa: F401
)
from livekit.plugins.turn_detector.english import EnglishModel


# load environment variables, this is optional, only used for local development
load_dotenv(dotenv_path=".env")
logger = logging.getLogger("med-reminder")
logger.setLevel(logging.INFO)

outbound_trunk_id = os.getenv("SIP_OUTBOUND_TRUNK_ID")

# Track call attempts for retry logic
call_attempts: dict[str, int] = {}
MAX_CALL_ATTEMPTS = 2
MAX_REFUSALS = 1


class MedicationReminderAgent(Agent):
    def __init__(
        self,
        *,
        dial_info: dict[str, Any],
    ):
        # Get the custom prompt from dial_info, or use a default
        prompt = dial_info.get("prompt", self._default_prompt(dial_info))
        
        super().__init__(instructions=prompt)
        
        # keep reference to the participant for transfers
        self.participant: rtc.RemoteParticipant | None = None
        self.dial_info = dial_info
        self.call_type = dial_info.get("call_type", "reminder")
        self.user_name = dial_info.get("user_name", "there")
        self.medicine_name = dial_info.get("medicine_name", "medication")
        self.head_of_family_phones = dial_info.get("head_of_family_phones", [])
        self.voicemail_suspected = False
        self.refusal_count = 0
        self.can_end_call = False

    def _default_prompt(self, dial_info: dict) -> str:
        """Generate a default prompt if none provided."""
        user_name = dial_info.get("user_name", "there")
        medicine_name = dial_info.get("medicine_name", "your medication")
        return f"""
        You are a friendly healthcare reminder assistant. Your interface with the user will be voice.
        
        As soon as the call is answered, immediately greet and deliver the medication reminder.
        
        Your opening line should be:
        "Hello {user_name}! This is a medication reminder. Please remember to take your {medicine_name}."
        
        Be friendly and helpful. Confirm they'll take their medication.
        Use the end_call tool when the conversation is complete.
        """

    def set_participant(self, participant: rtc.RemoteParticipant):
        self.participant = participant

    async def hangup(self):
        """Helper function to hang up the call by deleting the room"""
        job_ctx = get_job_context()
        try:
            await job_ctx.api.room.delete_room(
                api.DeleteRoomRequest(
                    room=job_ctx.room.name,
                )
            )
        except api.twirp_client.TwirpError as e:
            # room might have already been deleted (e.g., SIP call never connected)
            if e.code != "not_found":
                raise
            logger.debug(f"Room already deleted: {job_ctx.room.name}")

    async def call_head_of_family(self, reason: str = "missed calls"):
        """Call the next head of family contact."""
        if not self.head_of_family_phones:
            logger.info("No more head of family contacts to call")
            return False
        
        next_phone = self.head_of_family_phones[0]
        remaining_phones = self.head_of_family_phones[1:]
        
        logger.info(f"Calling head of family at {next_phone} due to: {reason}")
        
        job_ctx = get_job_context()
        
        # Create new dispatch for head of family
        new_metadata = {
            **self.dial_info,
            "phone_number": next_phone,
            "head_of_family_phones": remaining_phones,
            "is_head_of_family_call": True,
            "original_patient": self.user_name,
            "call_reason": reason
        }
        
        # Update prompt for head of family call
        new_metadata["prompt"] = f"""
        You are a concise healthcare reminder assistant calling {next_phone}. Speak immediately, keep every response to one short sentence, and sound calm.
        
        Conversation guide (do NOT say this aloud):
        • Sentence 1: "{self.user_name} needs to take {self.medicine_name} now; please make sure it happens."
        • Ask right away if they can confirm they'll handle it now.
        • As soon as they clearly confirm, silently call confirm_medication_taken, thank them briefly, and end the call.
        • If they refuse or hesitate, silently call decline_medication with the reason so you can respond once or escalate again.
        • If you suspect voicemail, briefly ask if anyone is there and pause.
        
        Keep everything short and direct.
        """
        
        try:
            await job_ctx.api.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(
                    agent_name="med-reminder",
                    room=f"med-hof-{next_phone.replace('+', '')}-{int(asyncio.get_event_loop().time())}",
                    metadata=json.dumps(new_metadata)
                )
            )
            logger.info(f"Dispatched head of family call to {next_phone}")
            return True
        except Exception as e:
            logger.error(f"Failed to dispatch head of family call: {e}")
            return False

    @function_tool()
    async def confirm_medication_taken(self, ctx: RunContext, confirmation: str = "confirmed"):
        """Called when the user confirms they have taken or will take the medication
        
        Args:
            confirmation: What the user said to confirm
        """
        logger.info(f"Medication confirmed for {self.user_name}: {confirmation}")
        
        self.can_end_call = True
        await ctx.session.generate_reply(
            instructions="Thank them warmly for confirming and wish them good health. Then end the call."
        )
        await ctx.wait_for_playout()
        await self.hangup()
        self.can_end_call = False

        return {"status": "confirmed", "user": self.user_name, "medicine": self.medicine_name}

    @function_tool()
    async def confirm_will_buy(self, ctx: RunContext, confirmation: str = "will purchase"):
        """Called when the user confirms they will buy/refill the medication
        
        Args:
            confirmation: What the user said to confirm
        """
        logger.info(f"Refill confirmed for {self.user_name}: {confirmation}")
        
        self.can_end_call = True
        await ctx.session.generate_reply(
            instructions="Thank them for confirming they'll get the refill. Remind them not to wait too long. Then end the call."
        )
        await ctx.wait_for_playout()
        await self.hangup()
        self.can_end_call = False

        return {"status": "will_buy", "user": self.user_name, "medicine": self.medicine_name}

    @function_tool()
    async def decline_medication(self, ctx: RunContext, reason: str = "user refused"):
        """Called when the user refuses or delays taking their medication

        Args:
            reason: Summary of why they refused
        """
        self.refusal_count += 1
        logger.info(f"{self.user_name} declined medication ({self.refusal_count}/{MAX_REFUSALS}): {reason}")

        if self.refusal_count >= MAX_REFUSALS:
            self.can_end_call = True
            await ctx.session.generate_reply(
                instructions="In one short sentence, tell them you'll inform their family so someone can help."
            )
            await ctx.wait_for_playout()
            if self.head_of_family_phones:
                await self.call_head_of_family(reason="patient refused medication")
            await self.hangup()
            self.can_end_call = False
            return {"status": "refused_escalated"}

        await ctx.session.generate_reply(
            instructions="Briefly explain why the dose matters and ask them once more to take it now."
        )
        return {"status": "refused_retry", "count": self.refusal_count}

    @function_tool()
    async def transfer_call(self, ctx: RunContext, reason: str = "user requested"):
        """Transfer the call to head of family or another contact

        Args:
            reason: The reason for transferring the call
        """
        transfer_to = self.dial_info.get("transfer_to")
        if not transfer_to and self.head_of_family_phones:
            transfer_to = self.head_of_family_phones[0]
        
        if not transfer_to:
            return "No transfer number available"

        logger.info(f"Transferring call to {transfer_to}: {reason}")

        try:
            await ctx.session.generate_reply(
                instructions="Let the user know you'll transfer them to someone who can help."
            )
        except RuntimeError:
            logger.info("Session is closing; skipping transfer announcement.")

        job_ctx = get_job_context()
        try:
            await job_ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=job_ctx.room.name,
                    participant_identity=self.participant.identity,
                    transfer_to=f"tel:{transfer_to}",
                )
            )
            logger.info(f"Transferred call to {transfer_to}")
        except api.twirp_client.TwirpError as e:
            if e.code == "not_found":
                logger.warning("Participant missing during transfer; likely already left call.")
            else:
                logger.error(f"Error transferring call: {e}")
                try:
                    await ctx.session.generate_reply(
                        instructions="Apologize that you couldn't complete the transfer."
                    )
                except RuntimeError:
                    logger.info("Session closing; unable to play transfer failure message.")

    @function_tool()
    async def end_call(self, ctx: RunContext, reason: str = "conversation complete"):
        """Called when the conversation is complete and the call should end

        Args:
            reason: The reason for ending the call
        """
        if not self.can_end_call:
            logger.info("End call requested before confirmation; continuing conversation instead.")
            await ctx.session.generate_reply(
                instructions=(
                    "We still need a clear confirmation or reason to end the call. "
                    "Please continue the conversation with the user."
                )
            )
            return {"status": "not_ready"}

        logger.info(f"Ending call for {self.participant.identity}: {reason}")

        await ctx.wait_for_playout()

        await self.hangup()
        self.can_end_call = False

    @function_tool()
    async def detected_answering_machine(self, ctx: RunContext, greeting_heard: str = "voicemail"):
        """Called when the call reaches voicemail. Use this tool AFTER you hear the voicemail greeting

        Args:
            greeting_heard: Description of the voicemail greeting heard
        """
        phone = self.dial_info.get("phone_number", "unknown")
        logger.info(f"Detected answering machine for {phone}: {greeting_heard}")

        # The LLM can sometimes be over-eager. Require a confirmation cycle before hanging up.
        if not self.voicemail_suspected:
            self.voicemail_suspected = True
            logger.info("Voicemail not confirmed yet; asking user to confirm they're present.")
            await ctx.session.generate_reply(
                instructions=(
                    "Say: 'I might be talking to a voicemail. "
                    "If you're there, please let me know so I can continue.' "
                    "Then pause to listen."
                )
            )
            return {"status": "awaiting_confirmation"}
        
        # Track this as a missed call
        call_key = f"{phone}_{self.medicine_name}"
        call_attempts[call_key] = call_attempts.get(call_key, 0) + 1
        
        if call_attempts[call_key] >= MAX_CALL_ATTEMPTS:
            logger.info(f"Max attempts ({MAX_CALL_ATTEMPTS}) reached for {phone}, calling head of family")
            await self.call_head_of_family(reason=f"Patient did not answer after {MAX_CALL_ATTEMPTS} attempts")
        else:
            logger.info(f"Attempt {call_attempts[call_key]} of {MAX_CALL_ATTEMPTS} for {phone}")
            # Could schedule a retry here
        
        await self.hangup()

    @function_tool()
    async def patient_unavailable(self, ctx: RunContext, reason: str = "did not answer"):
        """Called when patient cannot be reached or is unavailable
        
        Args:
            reason: Why the patient is unavailable
        """
        logger.info(f"Patient {self.user_name} unavailable: {reason}")
        
        if self.head_of_family_phones:
            await self.call_head_of_family(reason=reason)
        
        await self.hangup()


async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to room {ctx.room.name}")
    await ctx.connect()

    # Parse the call info from metadata
    dial_info = json.loads(ctx.job.metadata)
    retry_attempts = dial_info.get("retry_attempts", 0)
    phone_number = dial_info["phone_number"]
    participant_identity = phone_number

    logger.info(f"Call type: {dial_info.get('call_type', 'unknown')}")
    logger.info(f"User: {dial_info.get('user_name', 'unknown')}")
    logger.info(f"Medicine: {dial_info.get('medicine_name', 'unknown')}")

    # Create the agent with the appropriate prompt
    agent = MedicationReminderAgent(dial_info=dial_info)

    # Configure the AI session
    session = AgentSession(
        turn_detection=EnglishModel(),
        vad=silero.VAD.load(),
        stt=deepgram.STT(),
        tts=cartesia.TTS(),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
    )

    # Start session before dialing
    session_started = asyncio.create_task(
        session.start(
            agent=agent,
            room=ctx.room,
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
            ),
        )
    )

    # Dial the user
    try:
        await ctx.api.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                room_name=ctx.room.name,
                sip_trunk_id=outbound_trunk_id,
                sip_call_to=phone_number,
                participant_identity=participant_identity,
                wait_until_answered=True,
            )
        )

        await session_started
        participant = await ctx.wait_for_participant(identity=participant_identity)
        logger.info(f"Participant joined: {participant.identity}")

        agent.set_participant(participant)

    except api.TwirpError as e:
        logger.error(
            f"Error creating SIP participant: {e.message}, "
            f"SIP status: {e.metadata.get('sip_status_code')} "
            f"{e.metadata.get('sip_status')}"
        )
        
        status_code = e.metadata.get("sip_status_code")

        if status_code in ("486", "480") and retry_attempts < MAX_CALL_ATTEMPTS:
            logger.info("Call busy/unavailable. Retrying...")
            new_metadata = {
                **dial_info,
                "retry_attempts": retry_attempts + 1,
            }
            await ctx.api.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(
                    agent_name="med-reminder",
                    room=f"med-retry-{phone_number.replace('+', '')}-{int(asyncio.get_event_loop().time())}",
                    metadata=json.dumps(new_metadata),
                )
            )
        elif dial_info.get("head_of_family_phones"):
            await agent.call_head_of_family(reason=f"Call failed: {e.message}")
        
        ctx.shutdown()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="med-reminder",
        )
    )

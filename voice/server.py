from __future__ import annotations

import os
import json
import logging
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from livekit import api

load_dotenv(dotenv_path=".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("med-reminder-server")

app = FastAPI(
    title="Medicine Reminder API",
    description="API for medication reminders and purchase notifications",
    version="1.0.0"
)

# LiveKit configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")


class MedicineInfo(BaseModel):
    name: str = Field(..., description="Name of the medicine")
    dosage: str = Field(..., description="Dosage amount (e.g., '1 tablet', '5ml')")
    next_dose_time: str = Field(..., description="When to take next dose (e.g., '8:00 AM')")
    instructions: Optional[str] = Field(None, description="Special instructions (e.g., 'take with food')")


class CallReminderRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format (e.g., +14155551234)")
    user_name: str = Field(..., description="Name of the patient")
    user_type: str = Field(..., description="Type of user: 'senior', 'adult', or 'kid'")
    medicine: MedicineInfo
    head_of_family_phones: list[str] = Field(
        default=[],
        description="List of backup phone numbers for head of family"
    )
    is_head_of_family_call: bool = Field(
        default=False,
        description="Whether this call is to the head of family about someone else"
    )
    patient_name: Optional[str] = Field(
        None,
        description="If calling head of family, the patient's name they're responsible for"
    )


class CallBuyRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format")
    user_name: str = Field(..., description="Name of the person to call")
    user_type: str = Field(..., description="Type of user: 'senior', 'adult', or 'kid'")
    medicine: MedicineInfo
    remaining_count: int = Field(..., description="Number of pills/doses remaining")
    days_supply_left: int = Field(..., description="Estimated days of supply left")
    head_of_family_phones: list[str] = Field(
        default=[],
        description="List of backup phone numbers for head of family"
    )


class CallResponse(BaseModel):
    success: bool
    message: str
    dispatch_id: Optional[str] = None


def generate_reminder_prompt(
    user_name: str,
    user_type: str,
    medicine: MedicineInfo,
    is_head_of_family_call: bool = False,
    patient_name: Optional[str] = None
) -> str:
    """Generate appropriate prompt based on user type and call context."""
    
    medicine_details = f"""
    Medicine: {medicine.name}
    Dosage: {medicine.dosage}
    Time: {medicine.next_dose_time}
    {f'Instructions: {medicine.instructions}' if medicine.instructions else ''}
    """
    
    if is_head_of_family_call and patient_name:
        # Calling head of family about a minor or after missed calls
        return f"""
        You are a caring healthcare reminder assistant. Speak immediately when the line opens, keep every response to one short sentence, and sound natural.

        Conversation approach:
        • First sentence: "{user_name}, please make sure {patient_name} takes their {medicine.name} ({medicine.dosage}) right now."
        • Immediately ask {user_name} to confirm they'll help {patient_name} take it now.
        • The moment they clearly say yes, silently call confirm_medication_taken (do not mention tools), thank them in one short sentence, and end the call.
        • If they hesitate or refuse, silently call the decline_medication tool with their exact reason (never mention tools aloud), then respond once or escalate.
        • When they confirm, silently call confirm_medication_taken, thank them in one short sentence, and end the call.
        • Use end_call only after confirmation.
        • If you suspect voicemail, briefly ask if anyone is there and pause.

        Medicine details:{medicine_details}
        """
    
    if user_type == "kid":
        # For kids, we call the head of family
        return f"""
        You are a caring healthcare reminder assistant speaking to a caretaker about {user_name}. Start talking immediately and keep each response to one short sentence.

        Conversation approach:
        • Sentence 1: "{user_name} needs their {medicine.name} ({medicine.dosage}) at {medicine.next_dose_time}, please give it now."
        • Ask right away if they will give the medicine now.
        • As soon as they confirm, silently call confirm_medication_taken, thank them, and end.
        • If they hesitate, silently call decline_medication with their reason, respond once, and follow the tool’s guidance.
        • When they agree, silently call confirm_medication_taken and thank them quickly.
        • Use end_call only after confirmation.
        • If you suspect voicemail, ask once if anyone is there and pause.

        Medicine details:{medicine_details}
        """
    
    elif user_type == "senior":
        # For seniors, be extra clear and patient
        return f"""
        You are a caring healthcare reminder assistant speaking with {user_name}. Start talking immediately, stay calm, but keep every response to one or two short sentences.

        Conversation approach:
        • First sentence: "{user_name}, please take your {medicine.name} ({medicine.dosage}) right now."
        • Ask politely if they can take it now.
        • As soon as they agree, silently call confirm_medication_taken, thank them, and end.
        • If they hesitate, silently call decline_medication with their reason, respond once, and escalate if it happens again.
        • When they confirm, silently call confirm_medication_taken and thank them briefly.
        • Use end_call only after confirmation.
        • If you suspect voicemail, ask once if anyone is there and pause.

        Medicine details:{medicine_details}
        """
    
    else:  # adult
        return f"""
        You are a friendly healthcare reminder assistant speaking with {user_name}. Start speaking immediately and keep each response to one or two short sentences.

        Conversation approach:
        • First sentence: "{user_name}, please take your {medicine.name} ({medicine.dosage}) right now."
        • Ask if they can take it now.
        • Once they confirm, silently call confirm_medication_taken, thank them briefly, and end.
        • If they push back, silently call decline_medication with their reason, respond once, and escalate if needed.
        • When they confirm, silently call confirm_medication_taken, thank them briefly, and end.
        • Ask once if anyone is there when voicemail is suspected.

        Medicine details:{medicine_details}
        """


def generate_buy_prompt(
    user_name: str,
    user_type: str,
    medicine: MedicineInfo,
    remaining_count: int,
    days_supply_left: int
) -> str:
    """Generate prompt for medication purchase reminder."""

    urgency = "urgent" if days_supply_left <= 3 else "soon"

    return f"""
    You are a helpful healthcare assistant speaking with {user_name}. Start talking immediately and keep every response to one or two short sentences.

    Conversation approach:
    • Sentence 1: "{user_name}, please get more {medicine.name}; only about {remaining_count} doses ({days_supply_left} days) remain."
    • Ask them to get a refill {"right away" if urgency == "urgent" else "soon"} and confirm they'll do it.
    • As soon as they confirm, silently call confirm_will_buy, thank them in one short sentence, and end.
    • If they hesitate, silently call decline_medication with their reason so you can respond once or escalate.
    • When they confirm, silently call confirm_will_buy, thank them briefly, and end.
    • If you suspect voicemail, ask once if anyone is there and pause.

    {"Speak clearly and slowly for seniors, but stay concise." if user_type == "senior" else ""}
    """


async def dispatch_call(
    phone_number: str,
    call_type: str,
    prompt: str,
    head_of_family_phones: list[str],
    user_name: str,
    medicine_name: str,
    **extra_data,
) -> str:
    """Dispatch a call via LiveKit."""
    
    livekit_api = api.LiveKitAPI(
        LIVEKIT_URL,
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET
    )
    
    retry_attempts = extra_data.get("retry_attempts", 0)

    metadata = {
        "phone_number": phone_number,
        "call_type": call_type,
        "prompt": prompt,
        "user_name": user_name,
        "medicine_name": medicine_name,
        "head_of_family_phones": head_of_family_phones,
        "transfer_to": head_of_family_phones[0] if head_of_family_phones else None,
        "retry_attempts": retry_attempts,
        **extra_data
    }
    
    try:
        dispatch = await livekit_api.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name="med-reminder",
                room=f"med-call-{phone_number.replace('+', '')}-{int(datetime.now().timestamp())}",
                metadata=json.dumps(metadata)
            )
        )
        dispatch_id = getattr(dispatch, "dispatch_id", None)

        if not dispatch_id:
            dispatch_id = getattr(dispatch, "id", None)
        if not dispatch_id:
            # some versions wrap the dispatch in a `dispatch` field
            dispatch_obj = getattr(dispatch, "dispatch", None)
            if dispatch_obj:
                dispatch_id = getattr(dispatch_obj, "dispatch_id", None) or getattr(
                    dispatch_obj, "id", None
                )

        if not dispatch_id:
            # log entire response to aid debugging
            logger.error(f"Unable to determine dispatch_id from response: {dispatch}")
            raise RuntimeError("dispatch response missing dispatch_id")

        logger.info(f"Dispatched call to {phone_number}, dispatch_id: {dispatch_id}")
        return dispatch_id
    except Exception as e:
        logger.error(f"Failed to dispatch call: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to dispatch call: {str(e)}")
    finally:
        await livekit_api.aclose()


@app.post("/call-reminder", response_model=CallResponse)
async def call_reminder(request: CallReminderRequest):
    """
    Make a medication reminder call.
    
    For kids: Automatically calls the head of family.
    For adults/seniors: Calls the patient directly.
    """
    
    if request.user_type not in ["senior", "adult", "kid"]:
        raise HTTPException(
            status_code=400,
            detail="user_type must be 'senior', 'adult', or 'kid'"
        )
    
    # For kids, we need head of family contacts
    if request.user_type == "kid" and not request.head_of_family_phones:
        raise HTTPException(
            status_code=400,
            detail="head_of_family_phones is required for kid patients"
        )
    
    # Determine who to call
    if request.user_type == "kid":
        # Call head of family for kids
        call_phone = request.head_of_family_phones[0]
        prompt = generate_reminder_prompt(
            user_name=request.user_name,  # Will mention the kid's name
            user_type="kid",
            medicine=request.medicine,
            is_head_of_family_call=True,
            patient_name=request.user_name
        )
        remaining_contacts = request.head_of_family_phones[1:]
    elif request.is_head_of_family_call:
        # Calling head of family about someone else
        call_phone = request.phone_number
        prompt = generate_reminder_prompt(
            user_name=request.user_name,
            user_type=request.user_type,
            medicine=request.medicine,
            is_head_of_family_call=True,
            patient_name=request.patient_name
        )
        remaining_contacts = request.head_of_family_phones
    else:
        # Normal call to patient
        call_phone = request.phone_number
        prompt = generate_reminder_prompt(
            user_name=request.user_name,
            user_type=request.user_type,
            medicine=request.medicine
        )
        remaining_contacts = request.head_of_family_phones
    
    dispatch_id = await dispatch_call(
        phone_number=call_phone,
        call_type="reminder",
        prompt=prompt,
        head_of_family_phones=remaining_contacts,
        user_name=request.user_name,
        medicine_name=request.medicine.name,
        user_type=request.user_type,
        dosage=request.medicine.dosage,
        next_dose_time=request.medicine.next_dose_time
    )
    
    return CallResponse(
        success=True,
        message=f"Reminder call dispatched to {call_phone}",
        dispatch_id=dispatch_id
    )


@app.post("/call-buy", response_model=CallResponse)
async def call_buy(request: CallBuyRequest):
    """
    Make a medication refill/purchase reminder call.
    
    Reminds the user to buy more medication before it runs out.
    """
    
    if request.user_type not in ["senior", "adult", "kid"]:
        raise HTTPException(
            status_code=400,
            detail="user_type must be 'senior', 'adult', or 'kid'"
        )
    
    # For kids, call head of family
    if request.user_type == "kid":
        if not request.head_of_family_phones:
            raise HTTPException(
                status_code=400,
                detail="head_of_family_phones is required for kid patients"
            )
        call_phone = request.head_of_family_phones[0]
        remaining_contacts = request.head_of_family_phones[1:]
    else:
        call_phone = request.phone_number
        remaining_contacts = request.head_of_family_phones
    
    prompt = generate_buy_prompt(
        user_name=request.user_name,
        user_type=request.user_type,
        medicine=request.medicine,
        remaining_count=request.remaining_count,
        days_supply_left=request.days_supply_left
    )
    
    dispatch_id = await dispatch_call(
        phone_number=call_phone,
        call_type="buy",
        prompt=prompt,
        head_of_family_phones=remaining_contacts,
        user_name=request.user_name,
        medicine_name=request.medicine.name,
        user_type=request.user_type,
        remaining_count=request.remaining_count,
        days_supply_left=request.days_supply_left
    )
    
    return CallResponse(
        success=True,
        message=f"Purchase reminder call dispatched to {call_phone}",
        dispatch_id=dispatch_id
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


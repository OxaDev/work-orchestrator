import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.auth.models import Locale, ThemePreference, UserRole

# Subdivisions of `holidays.France` that change the list of public holidays.
HolidaySubdivision = Literal["57", "971", "972", "973", "974", "976"]

DisplayName = Field(min_length=1, max_length=120)
OptionalDisplayName = Field(default=None, min_length=1, max_length=120)
# Policy is checked by the service (ADR-0008) so errors carry translatable codes.
RawPassword = Field(min_length=1, max_length=1024)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: UserRole
    locale: Locale
    theme: ThemePreference
    is_active: bool
    last_login_at: datetime | None
    employer_company_id: uuid.UUID | None = None
    holiday_subdivision: HolidaySubdivision | None = None
    created_at: datetime


class UserList(BaseModel):
    items: list[UserRead]
    total: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = RawPassword


class ProfileUpdate(BaseModel):
    display_name: str | None = OptionalDisplayName
    locale: Locale | None = None
    theme: ThemePreference | None = None
    # "My ESN" (ADR-0017); explicit null clears it.
    employer_company_id: uuid.UUID | None = None
    # Public holidays region (ADR-0018); explicit null = metropolitan France.
    holiday_subdivision: HolidaySubdivision | None = None


class PasswordChange(BaseModel):
    current_password: str = RawPassword
    new_password: str = RawPassword


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = DisplayName
    password: str = RawPassword
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    display_name: str | None = OptionalDisplayName
    role: UserRole | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: str = RawPassword

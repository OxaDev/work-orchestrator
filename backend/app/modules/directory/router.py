"""Directory endpoints: sectors, companies, organisation, contacts."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.modules.auth.dependencies import DbSession
from app.modules.directory.models import CompanyType
from app.modules.directory.schemas import (
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    ContactCreate,
    ContactDetail,
    ContactRead,
    ContactUpdate,
    DuplicateCandidate,
    EmploymentCreate,
    OrgUnitCreate,
    OrgUnitRead,
    OrgUnitUpdate,
    SectorCreate,
    SectorRead,
    SectorUpdate,
)
from app.modules.directory.service import (
    CompanyService,
    ContactService,
    OrgUnitService,
    SectorService,
)
from app.shared.schemas import IncludeArchived, Limit, Offset, Page, Search

sectors_router = APIRouter(prefix="/sectors", tags=["sectors"])
companies_router = APIRouter(prefix="/companies", tags=["companies"])
org_units_router = APIRouter(prefix="/org-units", tags=["org-units"])
contacts_router = APIRouter(prefix="/contacts", tags=["contacts"])

NO_CONTENT = status.HTTP_204_NO_CONTENT


# --- sectors --------------------------------------------------------------------------------


@sectors_router.get("", response_model=list[SectorRead])
async def list_sectors(session: DbSession) -> list[SectorRead]:
    """Flat list (with parent_id): the client builds the tree."""
    return await SectorService(session).all()


@sectors_router.post("", response_model=SectorRead, status_code=status.HTTP_201_CREATED)
async def create_sector(body: SectorCreate, session: DbSession) -> SectorRead:
    return SectorRead.model_validate(await SectorService(session).create(body))


@sectors_router.patch("/{sector_id}", response_model=SectorRead)
async def update_sector(sector_id: uuid.UUID, body: SectorUpdate, session: DbSession) -> SectorRead:
    return SectorRead.model_validate(await SectorService(session).update(sector_id, body))


@sectors_router.delete("/{sector_id}", status_code=NO_CONTENT)
async def delete_sector(sector_id: uuid.UUID, session: DbSession) -> Response:
    await SectorService(session).delete(sector_id)
    return Response(status_code=NO_CONTENT)


# --- companies ------------------------------------------------------------------------------


@companies_router.get("", response_model=Page[CompanyRead])
async def list_companies(
    session: DbSession,
    q: Search = None,
    type: CompanyType | None = None,  # noqa: A002 - public query parameter name
    sector_id: uuid.UUID | None = None,
    tag_id: uuid.UUID | None = None,
    include_archived: IncludeArchived = False,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[CompanyRead]:
    service = CompanyService(session)
    items, total = await service.search(
        search=q,
        company_type=type,
        sector_id=sector_id,
        tag_id=tag_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return Page(items=await service.to_read(items), total=total)


@companies_router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(body: CompanyCreate, session: DbSession) -> CompanyRead:
    service = CompanyService(session)
    return (await service.to_read([await service.create(body)]))[0]


@companies_router.get("/{company_id}", response_model=CompanyRead)
async def read_company(company_id: uuid.UUID, session: DbSession) -> CompanyRead:
    service = CompanyService(session)
    return (await service.to_read([await service.get(company_id)]))[0]


@companies_router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: uuid.UUID, body: CompanyUpdate, session: DbSession
) -> CompanyRead:
    service = CompanyService(session)
    return (await service.to_read([await service.update(company_id, body)]))[0]


@companies_router.post("/{company_id}/archive", response_model=CompanyRead)
async def archive_company(company_id: uuid.UUID, session: DbSession) -> CompanyRead:
    service = CompanyService(session)
    return (await service.to_read([await service.set_archived(company_id, True)]))[0]


@companies_router.post("/{company_id}/restore", response_model=CompanyRead)
async def restore_company(company_id: uuid.UUID, session: DbSession) -> CompanyRead:
    service = CompanyService(session)
    return (await service.to_read([await service.set_archived(company_id, False)]))[0]


@companies_router.get("/{company_id}/org-units", response_model=list[OrgUnitRead])
async def list_org_units(company_id: uuid.UUID, session: DbSession) -> list[OrgUnitRead]:
    """Flat list (with parent_id) of the company's organisation."""
    return [
        OrgUnitRead.model_validate(u) for u in await OrgUnitService(session).for_company(company_id)
    ]


@companies_router.post(
    "/{company_id}/org-units", response_model=OrgUnitRead, status_code=status.HTTP_201_CREATED
)
async def create_org_unit(
    company_id: uuid.UUID, body: OrgUnitCreate, session: DbSession
) -> OrgUnitRead:
    return OrgUnitRead.model_validate(await OrgUnitService(session).create(company_id, body))


# --- organisation units ---------------------------------------------------------------------


@org_units_router.patch("/{unit_id}", response_model=OrgUnitRead)
async def update_org_unit(
    unit_id: uuid.UUID, body: OrgUnitUpdate, session: DbSession
) -> OrgUnitRead:
    return OrgUnitRead.model_validate(await OrgUnitService(session).update(unit_id, body))


@org_units_router.delete("/{unit_id}", status_code=NO_CONTENT)
async def delete_org_unit(unit_id: uuid.UUID, session: DbSession) -> Response:
    await OrgUnitService(session).delete(unit_id)
    return Response(status_code=NO_CONTENT)


@org_units_router.get("/{unit_id}/ancestors", response_model=list[OrgUnitRead])
async def org_unit_ancestors(unit_id: uuid.UUID, session: DbSession) -> list[OrgUnitRead]:
    """Parent first, root last (e.g. équipe -> pôle -> direction)."""
    return [OrgUnitRead.model_validate(u) for u in await OrgUnitService(session).ancestors(unit_id)]


@org_units_router.get("/{unit_id}/descendants", response_model=list[OrgUnitRead])
async def org_unit_descendants(unit_id: uuid.UUID, session: DbSession) -> list[OrgUnitRead]:
    return [
        OrgUnitRead.model_validate(u) for u in await OrgUnitService(session).descendants(unit_id)
    ]


# --- contacts -------------------------------------------------------------------------------


@contacts_router.get("", response_model=Page[ContactRead])
async def list_contacts(
    session: DbSession,
    q: Search = None,
    company_id: uuid.UUID | None = None,
    org_unit_id: uuid.UUID | None = None,
    tag_id: uuid.UUID | None = None,
    include_archived: IncludeArchived = False,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[ContactRead]:
    service = ContactService(session)
    items, total = await service.search(
        search=q,
        company_id=company_id,
        org_unit_id=org_unit_id,
        tag_id=tag_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return Page(items=await service.to_read(items), total=total)


@contacts_router.get("/duplicates", response_model=list[DuplicateCandidate])
async def find_duplicates(
    session: DbSession,
    first_name: Annotated[str, Query(min_length=1, max_length=100)],
    last_name: Annotated[str, Query(min_length=1, max_length=100)],
    email: Annotated[list[str] | None, Query(max_length=5)] = None,
    exclude_id: uuid.UUID | None = None,
) -> list[DuplicateCandidate]:
    """Possible duplicates to show before creating or renaming a contact (P2-9)."""
    return await ContactService(session).duplicates(first_name, last_name, email or [], exclude_id)


@contacts_router.post("", response_model=ContactDetail, status_code=status.HTTP_201_CREATED)
async def create_contact(body: ContactCreate, session: DbSession) -> ContactDetail:
    service = ContactService(session)
    return await service.detail(await service.create(body))


@contacts_router.get("/{contact_id}", response_model=ContactDetail)
async def read_contact(contact_id: uuid.UUID, session: DbSession) -> ContactDetail:
    service = ContactService(session)
    return await service.detail(await service.get(contact_id))


@contacts_router.patch("/{contact_id}", response_model=ContactDetail)
async def update_contact(
    contact_id: uuid.UUID, body: ContactUpdate, session: DbSession
) -> ContactDetail:
    service = ContactService(session)
    return await service.detail(await service.update(contact_id, body))


@contacts_router.post("/{contact_id}/archive", response_model=ContactDetail)
async def archive_contact(contact_id: uuid.UUID, session: DbSession) -> ContactDetail:
    service = ContactService(session)
    return await service.detail(await service.set_archived(contact_id, True))


@contacts_router.post("/{contact_id}/restore", response_model=ContactDetail)
async def restore_contact(contact_id: uuid.UUID, session: DbSession) -> ContactDetail:
    service = ContactService(session)
    return await service.detail(await service.set_archived(contact_id, False))


@contacts_router.post(
    "/{contact_id}/employments", response_model=ContactDetail, status_code=status.HTTP_201_CREATED
)
async def add_employment(
    contact_id: uuid.UUID, body: EmploymentCreate, session: DbSession
) -> ContactDetail:
    service = ContactService(session)
    await service.add_employment(contact_id, body)
    return await service.detail(await service.get(contact_id))


@contacts_router.delete("/{contact_id}/employments/{employment_id}", response_model=ContactDetail)
async def delete_employment(
    contact_id: uuid.UUID, employment_id: uuid.UUID, session: DbSession
) -> ContactDetail:
    service = ContactService(session)
    await service.delete_employment(contact_id, employment_id)
    return await service.detail(await service.get(contact_id))

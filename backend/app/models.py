"""Aggregates every ORM model so Alembic autogenerate and tests see the full metadata.

Each module adds its import here when it defines models, e.g.:
    from app.modules.missions import models as _missions  # noqa: F401
"""

from app.modules.agenda import models as _agenda_models  # noqa: F401
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.directory import models as _directory_models  # noqa: F401
from app.modules.missions import models as _missions_models  # noqa: F401
from app.modules.tags import models as _tags_models  # noqa: F401
from app.modules.technologies import models as _technologies_models  # noqa: F401
from app.shared.models import Base

__all__ = ["Base"]

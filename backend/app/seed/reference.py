"""Reference data shipped with the application (ADR-0031): idempotent, safe in production.

Run by `make init`, `make deploy` and `make seed` through `app.cli seed-reference`.
Existing rows are never modified, so user edits survive re-runs.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import HalfDayKind, HalfDaySubtype
from app.modules.directory.models import Sector
from app.modules.missions.models import ContactRole
from app.modules.technologies.models import Technology
from app.modules.technologies.models import TechnologyCategory as C
from app.shared.text import normalize_text

# (name_fr, name_en, [(child_fr, child_en), ...])
SECTORS: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Finance", "Finance", [
        ("Banque de détail", "Retail banking"),
        ("Banque d'investissement", "Investment banking"),
        ("Gestion d'actifs", "Asset management"),
        ("Paiement", "Payments"),
    ]),
    ("Assurance", "Insurance", [
        ("Assurance de biens", "Property insurance"),
        ("Assurance de personnes", "Life & health insurance"),
        ("Mutuelle", "Mutual insurance"),
    ]),
    ("Commerce", "Retail", [
        ("Grande distribution", "Mass retail"),
        ("E-commerce", "E-commerce"),
        ("Luxe", "Luxury"),
    ]),
    ("Industrie", "Industry", [
        ("Automobile", "Automotive"),
        ("Aéronautique et défense", "Aerospace & defence"),
        ("Chimie et pharmacie", "Chemicals & pharma"),
    ]),
    ("Énergie et environnement", "Energy & utilities", [
        ("Électricité et gaz", "Power & gas"),
        ("Eau et déchets", "Water & waste"),
    ]),
    ("Transport et logistique", "Transport & logistics", [
        ("Ferroviaire", "Rail"),
        ("Aérien", "Air transport"),
        ("Logistique", "Logistics"),
    ]),
    ("Télécommunications et médias", "Telecoms & media", [
        ("Opérateurs télécom", "Telecom operators"),
        ("Médias et divertissement", "Media & entertainment"),
    ]),
    ("Secteur public", "Public sector", [
        ("Administration", "Government"),
        ("Santé publique", "Public health"),
        ("Éducation", "Education"),
    ]),
    ("Santé", "Healthcare", []),
    ("Services numériques", "IT services", [
        ("ESN", "IT consulting"),
        ("Éditeur de logiciels", "Software vendor"),
    ]),
]  # fmt: skip

# (name, category, aliases)
TECHNOLOGIES: list[tuple[str, C, list[str]]] = [
    # Languages
    ("Python", C.LANGUAGE, []), ("Java", C.LANGUAGE, []), ("Kotlin", C.LANGUAGE, []),
    ("Scala", C.LANGUAGE, []), ("JavaScript", C.LANGUAGE, ["JS", "ECMAScript"]),
    ("TypeScript", C.LANGUAGE, ["TS"]), ("Go", C.LANGUAGE, ["Golang"]), ("Rust", C.LANGUAGE, []),
    ("C", C.LANGUAGE, []), ("C++", C.LANGUAGE, ["cpp"]), ("C#", C.LANGUAGE, ["csharp"]),
    ("PHP", C.LANGUAGE, []), ("Ruby", C.LANGUAGE, []), ("Swift", C.LANGUAGE, []),
    ("Dart", C.LANGUAGE, []), ("SQL", C.LANGUAGE, []), ("PL/SQL", C.LANGUAGE, []),
    ("Bash", C.LANGUAGE, ["Shell"]), ("PowerShell", C.LANGUAGE, []), ("COBOL", C.LANGUAGE, []),
    ("R", C.LANGUAGE, []), ("Elixir", C.LANGUAGE, []), ("Groovy", C.LANGUAGE, []),
    # Frameworks
    ("Spring Boot", C.FRAMEWORK, ["Spring"]), ("Quarkus", C.FRAMEWORK, []),
    ("Micronaut", C.FRAMEWORK, []), ("Jakarta EE", C.FRAMEWORK, ["Java EE", "J2EE"]),
    ("Django", C.FRAMEWORK, []), ("FastAPI", C.FRAMEWORK, []), ("Flask", C.FRAMEWORK, []),
    ("Node.js", C.FRAMEWORK, ["Node"]), ("Express", C.FRAMEWORK, []), ("NestJS", C.FRAMEWORK, []),
    ("React", C.FRAMEWORK, ["ReactJS"]), ("Angular", C.FRAMEWORK, []), ("Vue.js", C.FRAMEWORK, ["Vue"]),
    ("Svelte", C.FRAMEWORK, []), ("Next.js", C.FRAMEWORK, []), (".NET", C.FRAMEWORK, ["dotnet"]),
    ("ASP.NET Core", C.FRAMEWORK, []), ("Laravel", C.FRAMEWORK, []), ("Symfony", C.FRAMEWORK, []),
    ("Ruby on Rails", C.FRAMEWORK, ["Rails"]), ("Flutter", C.FRAMEWORK, []),
    ("React Native", C.FRAMEWORK, []), ("Apache Spark", C.FRAMEWORK, ["Spark"]),
    ("Apache Flink", C.FRAMEWORK, ["Flink"]),
    # Libraries
    ("Hibernate", C.LIBRARY, ["JPA"]), ("SQLAlchemy", C.LIBRARY, []), ("Pandas", C.LIBRARY, []),
    ("NumPy", C.LIBRARY, []), ("Pydantic", C.LIBRARY, []), ("RxJS", C.LIBRARY, []),
    ("Redux", C.LIBRARY, []), ("TanStack Query", C.LIBRARY, ["React Query"]),
    ("JUnit", C.LIBRARY, []), ("Mockito", C.LIBRARY, []), ("pytest", C.LIBRARY, []),
    ("Jest", C.LIBRARY, []), ("Vitest", C.LIBRARY, []), ("Playwright", C.LIBRARY, []),
    ("Cypress", C.LIBRARY, []), ("Selenium", C.LIBRARY, []),
    # Databases
    ("PostgreSQL", C.DATABASE, ["Postgres"]), ("MySQL", C.DATABASE, []),
    ("MariaDB", C.DATABASE, []), ("Oracle Database", C.DATABASE, ["Oracle"]),
    ("Microsoft SQL Server", C.DATABASE, ["SQL Server", "MSSQL"]), ("SQLite", C.DATABASE, []),
    ("MongoDB", C.DATABASE, ["Mongo"]), ("Redis", C.DATABASE, []), ("Cassandra", C.DATABASE, []),
    ("Elasticsearch", C.DATABASE, ["Elastic"]), ("OpenSearch", C.DATABASE, []),
    ("Neo4j", C.DATABASE, []), ("DynamoDB", C.DATABASE, []), ("Couchbase", C.DATABASE, []),
    ("IBM Db2", C.DATABASE, ["DB2"]), ("Snowflake", C.DATABASE, []), ("BigQuery", C.DATABASE, []),
    ("ClickHouse", C.DATABASE, []),
    # Messaging
    ("Apache Kafka", C.MESSAGING, ["Kafka"]), ("RabbitMQ", C.MESSAGING, []),
    ("ActiveMQ", C.MESSAGING, []), ("IBM MQ", C.MESSAGING, ["MQSeries"]),
    ("Apache Pulsar", C.MESSAGING, ["Pulsar"]), ("NATS", C.MESSAGING, []),
    ("Amazon SQS", C.MESSAGING, ["SQS"]), ("Google Pub/Sub", C.MESSAGING, ["Pub/Sub"]),
    ("Azure Service Bus", C.MESSAGING, []),
    # Cloud
    ("Amazon Web Services", C.CLOUD, ["AWS"]), ("Microsoft Azure", C.CLOUD, ["Azure"]),
    ("Google Cloud Platform", C.CLOUD, ["GCP"]), ("OVHcloud", C.CLOUD, ["OVH"]),
    ("Scaleway", C.CLOUD, []), ("AWS Lambda", C.CLOUD, ["Lambda"]), ("Amazon S3", C.CLOUD, ["S3"]),
    ("Azure Functions", C.CLOUD, []), ("Cloudflare", C.CLOUD, []),
    # Infrastructure
    ("Docker", C.INFRASTRUCTURE, []), ("Kubernetes", C.INFRASTRUCTURE, ["K8s"]),
    ("OpenShift", C.INFRASTRUCTURE, []), ("Helm", C.INFRASTRUCTURE, []),
    ("Terraform", C.INFRASTRUCTURE, []), ("Ansible", C.INFRASTRUCTURE, []),
    ("Nginx", C.INFRASTRUCTURE, []), ("Apache HTTP Server", C.INFRASTRUCTURE, ["httpd"]),
    ("HAProxy", C.INFRASTRUCTURE, []), ("Traefik", C.INFRASTRUCTURE, []),
    ("Linux", C.INFRASTRUCTURE, []), ("VMware", C.INFRASTRUCTURE, []),
    ("Istio", C.INFRASTRUCTURE, []), ("Kong", C.INFRASTRUCTURE, []),
    ("Apigee", C.INFRASTRUCTURE, []), ("Tomcat", C.INFRASTRUCTURE, []),
    ("WildFly", C.INFRASTRUCTURE, ["JBoss"]), ("WebSphere", C.INFRASTRUCTURE, []),
    # DevOps
    ("Git", C.DEVOPS, []), ("GitLab", C.DEVOPS, ["GitLab CI"]), ("GitHub", C.DEVOPS, []),
    ("GitHub Actions", C.DEVOPS, []), ("Jenkins", C.DEVOPS, []), ("Azure DevOps", C.DEVOPS, []),
    ("Bitbucket", C.DEVOPS, []), ("Argo CD", C.DEVOPS, ["ArgoCD"]), ("SonarQube", C.DEVOPS, ["Sonar"]),
    ("Nexus Repository", C.DEVOPS, ["Nexus"]), ("Artifactory", C.DEVOPS, []),
    ("Maven", C.DEVOPS, []), ("Gradle", C.DEVOPS, []), ("npm", C.DEVOPS, []),
    ("uv", C.DEVOPS, []), ("Vite", C.DEVOPS, []), ("Webpack", C.DEVOPS, []),
    # Observability
    ("Prometheus", C.OBSERVABILITY, []), ("Grafana", C.OBSERVABILITY, []),
    ("Kibana", C.OBSERVABILITY, []), ("Datadog", C.OBSERVABILITY, []),
    ("Dynatrace", C.OBSERVABILITY, []), ("Splunk", C.OBSERVABILITY, []),
    ("OpenTelemetry", C.OBSERVABILITY, ["OTel"]), ("Jaeger", C.OBSERVABILITY, []),
    ("Sentry", C.OBSERVABILITY, []), ("ELK Stack", C.OBSERVABILITY, ["ELK"]),
    # Security
    ("Keycloak", C.SECURITY, []), ("OAuth 2.0", C.SECURITY, ["OAuth2"]),
    ("OpenID Connect", C.SECURITY, ["OIDC"]), ("SAML", C.SECURITY, []),
    ("HashiCorp Vault", C.SECURITY, ["Vault"]), ("Okta", C.SECURITY, []),
    ("Microsoft Entra ID", C.SECURITY, ["Azure AD"]), ("LDAP", C.SECURITY, ["Active Directory"]),
    # Data
    ("Apache Airflow", C.DATA, ["Airflow"]), ("dbt", C.DATA, []), ("Databricks", C.DATA, []),
    ("Apache Hadoop", C.DATA, ["Hadoop"]), ("Talend", C.DATA, []), ("Power BI", C.DATA, []),
    ("Tableau", C.DATA, []), ("Apache NiFi", C.DATA, ["NiFi"]),
    # Tools
    ("Jira", C.TOOL, []), ("Confluence", C.TOOL, []), ("Postman", C.TOOL, []),
    ("Swagger / OpenAPI", C.TOOL, ["OpenAPI", "Swagger"]), ("GraphQL", C.TOOL, []),
    ("gRPC", C.TOOL, []), ("REST", C.TOOL, []), ("SOAP", C.TOOL, []),
    ("Mermaid", C.TOOL, []), ("Markdown", C.TOOL, []),
    # Methods
    ("Scrum", C.METHOD, []), ("Kanban", C.METHOD, []), ("SAFe", C.METHOD, []),
    ("Domain-Driven Design", C.METHOD, ["DDD"]), ("Test-Driven Development", C.METHOD, ["TDD"]),
    ("Clean Architecture", C.METHOD, ["Hexagonal architecture"]),
    ("Microservices", C.METHOD, []), ("Event-Driven Architecture", C.METHOD, ["EDA"]),
    ("CQRS", C.METHOD, []), ("C4 Model", C.METHOD, ["C4"]),
]  # fmt: skip


# Initial contact roles in a mission (Q-D3): (name_fr, name_en)
CONTACT_ROLES: list[tuple[str, str]] = [
    ("Manager", "Manager"),
    ("Product owner", "Product owner"),
    ("Tech lead", "Tech lead"),
    ("Architecte", "Architect"),
    ("Collègue", "Colleague"),
    ("Ressources humaines", "Human resources"),
    ("Commercial ESN", "Account manager"),
    ("Sponsor", "Sponsor"),
]


# Initial subtypes of half-day kinds (Q-E1): (kind, name_fr, name_en)
HALF_DAY_SUBTYPES: list[tuple[HalfDayKind, str, str]] = [
    (HalfDayKind.LEAVE, "Congés payés", "Paid leave"),
    (HalfDayKind.LEAVE, "RTT", "RTT (reduced working time)"),
    (HalfDayKind.LEAVE, "Congé sans solde", "Unpaid leave"),
    (HalfDayKind.LEAVE, "Récupération", "Time off in lieu"),
    (HalfDayKind.LEAVE, "Congé exceptionnel", "Special leave"),
    (HalfDayKind.SICK_LEAVE, "Maladie", "Sick"),
    (HalfDayKind.SICK_LEAVE, "Enfant malade", "Sick child"),
    (HalfDayKind.TRAINING, "Formation interne", "Internal training"),
    (HalfDayKind.TRAINING, "Formation externe", "External training"),
    (HalfDayKind.TRAINING, "Certification", "Certification"),
    (HalfDayKind.INTERCONTRACT, "Avant-vente", "Pre-sales"),
    (HalfDayKind.OFF, "Pont", "Bridge day"),
]


@dataclass(frozen=True)
class SeedReport:
    sectors_added: int
    technologies_added: int
    roles_added: int = 0
    subtypes_added: int = 0


async def seed_reference(session: AsyncSession) -> SeedReport:
    sectors_added = 0
    existing = {
        (s.parent_id, normalize_text(s.name_fr)): s for s in await session.scalars(select(Sector))
    }
    for name_fr, name_en, children in SECTORS:
        root = existing.get((None, normalize_text(name_fr)))
        if root is None:
            root = Sector(name_fr=name_fr, name_en=name_en)
            session.add(root)
            await session.flush()
            sectors_added += 1
        for child_fr, child_en in children:
            if (root.id, normalize_text(child_fr)) not in existing:
                session.add(Sector(name_fr=child_fr, name_en=child_en, parent_id=root.id))
                sectors_added += 1

    known = set((await session.scalars(select(Technology.normalized_name))).all())
    technologies_added = 0
    for name, category, aliases in TECHNOLOGIES:
        if normalize_text(name) not in known:
            session.add(
                Technology(
                    name=name,
                    normalized_name=normalize_text(name),
                    category=category,
                    aliases=aliases,
                    description="",
                )
            )
            known.add(normalize_text(name))
            technologies_added += 1
    known_roles = set((await session.scalars(select(ContactRole.normalized_name))).all())
    roles_added = 0
    for name_fr, name_en in CONTACT_ROLES:
        if normalize_text(name_fr) not in known_roles:
            session.add(
                ContactRole(
                    name_fr=name_fr, name_en=name_en, normalized_name=normalize_text(name_fr)
                )
            )
            roles_added += 1
    known_subtypes = {
        (kind, name)
        for kind, name in await session.execute(
            select(HalfDaySubtype.kind, HalfDaySubtype.normalized_name)
        )
    }
    subtypes_added = 0
    for kind, name_fr, name_en in HALF_DAY_SUBTYPES:
        if (kind, normalize_text(name_fr)) not in known_subtypes:
            session.add(
                HalfDaySubtype(
                    kind=kind,
                    name_fr=name_fr,
                    name_en=name_en,
                    normalized_name=normalize_text(name_fr),
                )
            )
            subtypes_added += 1
    await session.commit()
    return SeedReport(sectors_added, technologies_added, roles_added, subtypes_added)

# Open Mind Public School Supabase setup और पुराने data का migration

यह गाइड मौजूदा React + Express + Prisma application को Supabase PostgreSQL से जोड़ने के लिए है। पुराने accounts, student drafts, attendance, fees और documents के links सुरक्षित रखने हैं। पहले Supabase तैयार करें, फिर backup और data transfer, उसके बाद application का connection बदलें।

19 नवंबर 2026 की स्थिति: **Supabase connection, schema migration, पुराने records का transfer और application cutover पूरे हैं।** चार repository migrations लागू हैं। सभी 26 application tables के record counts और पूरे row-content hashes final backup से मिले हैं। App के Prisma client से read/write/rollback जाँच सफल है; कोई test record नहीं रखा गया। Private credentials इस document में नहीं हैं।

App: http://127.0.0.1:5173/ · Admin login: http://127.0.0.1:5173/#/login/admin

Final private backup: `backups/supabase-2026-11-19T14-59-44-048Z`। इसमें `local-full.dump`, `school-data.dump`, `uploads.tar.gz`, `local.env`, `manifest.json` और `verified-target.json` हैं। पहले वाले full archive की अलग local database में restore rehearsal भी सफल रही। `.env` अब Supabase पर है; पुराने local database और uploads सुरक्षित हैं।

अब application में save किए गए database records सीधे Supabase में जाते हैं। Existing school accounts/passwords वही हैं। Database password school login password नहीं है। Files की bytes अभी इसी computer के `uploads/` में हैं; Supabase Storage integration अलग काम है।

नीचे setup और recovery runbook है। **Completed import को दोबारा न चलाएँ।** Automation `node scripts/supabase.mjs check` remote connection देखता है। `backup`, `migrate`, `verify` मूल local-to-Supabase transfer के लिए हैं और `.env` में local source होने की शर्त रखते हैं; cutover के बाद उन्हें दोबारा चलाने के लिए URL बदलना जरूरी नहीं है। Routine usage में `npm run dev` पर्याप्त है।

## 1 मौजूदा architecture और सही रास्ता

```text
Browser → Express API → Prisma 6.19 → Supabase PostgreSQL
              ↓
       uploads folder में files
```

अभी application अपने `User`, `Session` और `PasswordReset` tables से login चलाता है। Database बदलने से यह Supabase Auth में convert नहीं होगा। मौजूदा password hashes और role permissions transfer होंगे; passwords दोबारा बनाने की आवश्यकता नहीं है।

इस चरण के लिए Supabase Database पर्याप्त है। Supabase Auth, Realtime, Edge Functions, anon/publishable key या service-role key जोड़ना आवश्यक नहीं है। Frontend में `DATABASE_URL` या `VITE_DATABASE_URL` नहीं डालें। Database password केवल server configuration में रखें।

स्रोत: [schema](prisma/schema.prisma), [database client](server/db.ts), [startup](scripts/dev.mjs), [database runtime](scripts/database-runtime.mjs), [file handling](server/app.ts), [student files](server/student-profiles.ts)।

## 2 कौन सा data transfer होगा

Schema में **26 application tables** और Prisma की `_prisma_migrations` bookkeeping table है।

| क्षेत्र | Tables | उद्देश्य |
| --- | --- | --- |
| Accounts | User, Session, PasswordReset | Login, password hashes, sessions और recovery |
| School records | Student, Employee, Attendance | Registered students, staff और attendance |
| Fees | Invoice, Payment, Refund, GatewayOrder | Bills, payment allocation, refunds, gateway status |
| Fee office | FeeVersion, BillingAssignment, FeeCollection, FeeAdjustment, FeeInstallment, FeeGenerationBatch | Rates, assignments, collections, changes, installments, generation history |
| Academics और HR | Exam, Mark, Payroll | Exams, results और salaries |
| Secondary modules | Entry | Student drafts, activity, approvals, notices, homework और अन्य modules के JSON records |
| Settings | Configuration | School, access और अन्य settings |
| Website | Admission, WebsitePage | Enquiries और CMS |
| Documents और audit | Document, AuditLog, DeliveryLog | File metadata, audit और message delivery history |

Read-only audit में ये counts मिले। App चलते रहने से बाद में बदल सकते हैं; final backup के समय दोबारा baseline लें।

| Table या module | Records |
| --- | ---: |
| User | 3 |
| Employee | 1 |
| Student | 0 |
| Entry कुल | 1,441 |
| Entry में studentDrafts | 512 |
| Entry में activity | 913 |
| Entry में feeStructures | 11 |
| Entry में approvals / notifications / paymentVerifications / studentDocuments | 1 / 2 / 1 / 1 |
| Attendance | 129 |
| FeeVersion | 30 |
| Invoice | 1 |
| Configuration | 3 |
| AuditLog | 81 |
| Document और uploads में files | 1 और 1 |
| Session | 9 |
| बाकी application tables | 0 |
| Applied Prisma migrations | 4 |

`Student = 0` का अर्थ students गायब होना नहीं है: 512 records अभी `Entry.module = 'studentDrafts'` में हैं। IDs और JSON references जस के तस रखने हैं। Fees integer **paise** में हैं; transfer में रुपये में conversion नहीं करना है।

## 3 अभी Supabase dashboard में करें

1. अपना **Open Mind Public School** project खोलें और database ready होने दें।
2. **Data API** settings / integration overview खोलकर **Enable Data API → Off** करें। यह app Express API के जरिए database access करता है। Supabase भी Prisma-only उपयोग के लिए Data API बंद करने की सलाह देता है। [Official instructions](https://supabase.com/docs/guides/api/securing-your-api)
3. Project का **Connect** button खोलें। Connection string में **Session pooler** चुनें। Port **5432** होना चाहिए। Type/format दिखे तो URI चुनें।
4. उसी dialog से exact hostname, username और database name लें। Host region से अनुमान लगाकर नहीं बनाना है। Username सामान्यतः `postgres.PROJECT_REF` और database `postgres` होगा। Session pooler IPv4 networks पर इस्तेमाल हो सकता है। [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
5. Database password project बनाते समय रखा गया password है; Supabase account login password या API key नहीं। इसे chat में न भेजें। भूल गए हों तो project के Database settings में database password reset करें और नई configuration में वही उपयोग करें।
6. **SQL Editor → New query** में केवल यह read-only query चलाएँ:

```sql
select version();
```

यहाँ PostgreSQL **18.6** चल रहा है। Supabase का major version 18 से कम हो तो पहले उस version पर rehearsal करें। PostgreSQL नए version के dump को पुराने version में restore होने की guarantee नहीं देता। ऐसे में नीचे की schema-by-migrations और data-only योजना उपयोगी है, लेकिन successful rehearsal फिर भी आवश्यक है। [PostgreSQL compatibility](https://www.postgresql.org/docs/current/app-pgdump.html)

अभी Table Editor में manually tables न बनाएं। Existing migrations उनके columns, indexes, foreign keys और fee checks बनाएँगी। `auth` और `storage` जैसे Supabase-managed schemas में कोई बदलाव नहीं करना है।

## 4 आवश्यक configuration

| Setting | अभी क्या चाहिए |
| --- | --- |
| DATABASE_URL | Supabase Session pooler का PostgreSQL URI |
| PORT | 3001 |
| APP_ORIGIN | Local preview के लिए http://127.0.0.1:5173 |
| NODE_ENV | Local preview के लिए development |
| TRUST_PROXY | Local preview के लिए 0 |
| DIRECT_URL | अभी आवश्यक नहीं; current schema इसे पढ़ता ही नहीं है |
| ADMIN_EMAIL और ADMIN_PASSWORD | Existing accounts transfer होने पर bootstrap की जरूरत नहीं |
| Supabase API keys | Database-only setup में जरूरत नहीं |
| Razorpay, email और SMS credentials | मौजूदा integrations के लिए अलग configuration; Supabase इन्हें replace नहीं करता |

प्रोजेक्ट folder में **`.env.supabase`** नाम की private staging file बनाएँ। Existing `.env` अभी local database पर ही रखें। `.env.*` files repository के `.gitignore` में हैं। File permissions सीमित करें: `chmod 600 .env.supabase`।

```dotenv
DATABASE_URL="postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@EXACT_POOLER_HOST:5432/postgres?sslmode=require&connection_limit=5&connect_timeout=20&sslrootcert=ENCODED_ABSOLUTE_CA_PATH&sslcert=ENCODED_ABSOLUTE_CA_PATH&sslaccept=strict"
PORT=3001
APP_ORIGIN=http://127.0.0.1:5173
NODE_ENV=development
TRUST_PROXY=0
```

ऊपर सभी placeholders बदलें। Password के special characters URI-encode करने होते हैं, जैसे `@` → `%40`, `#` → `%23`, `%` → `%25`। पूरा URL encode न करें। Password किसी online encoder में न डालें। `connection_limit=5` शुरुआती local/persistent-server configuration है; अनेक server instances के लिए total connections के हिसाब से tune करें।

`sslmode=require` encrypted connection माँगता है। इस app में certificate verification के लिए दोनों CA path placeholders को `certs/supabase-ca.crt` के URI-encoded absolute path से बदलें। Public root certificate [Supabase के download endpoint](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) से लिया गया है। TLS error आने पर verification को globally बंद न करें। [SSL behavior](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl)

इस computer पर Prisma के native macOS TLS engine ने सही CA के बावजूद certificate reject किया। इसलिए server अब matching official `@prisma/adapter-pg@6.19.0` से connection करता है। CA verification तथा hostname verification enabled हैं।

`.env` और `.env.supabase` के DATABASE_URL में `sslrootcert` और `sslcert` दोनों public CA file के absolute path की URI-encoded value हैं; `sslaccept=strict` भी रखा गया है। `sslrootcert` Node adapter/startup checker पढ़ते हैं; `sslcert` native Prisma engine के लिए है। इस machine पर path `certs/supabase-ca.crt` का absolute रूप है। दूसरे host पर file deploy करके path वहाँ के अनुसार बदलें।

`npm run db:migrate` अब `scripts/prisma.mjs migrate deploy` चलाता है। macOS पर यह temporary loopback bridge के पीछे upstream Supabase TLS को Node से verify करता है; plaintext भाग केवल 127.0.0.1 पर process-local port तक है। Credentials/data Supabase तक verified TLS में जाते हैं। CLI बंद होने पर bridge बंद हो जाता है। Application runtime को bridge की जरूरत नहीं है। अन्य OS पर wrapper native Prisma CLI चलाता है।

External database पर `npm run dev` schema migrations अपने-आप नहीं लगाता। नई repository migration जोड़ने के बाद `npm run db:migrate` चलाएँ। सामान्य student/fee/account records app में save करने पर सीधे database में लिखते हैं।

## 5 Backup और transfer की तैयारी

यह हिस्सा computer के Terminal में है, Supabase SQL Editor में नहीं। नीचे manual recovery/reference commands हैं; completed transfer automation से किया गया है। नई migration से पहले पूरे steps पढ़ें और target connection जाँचें।

```sh
cd "/Users/asjadmac/Desktop/open mind public school/open-mind-school"
pg_dump --version
pg_restore --version
psql --version
```

PostgreSQL **18.6 client tools** इस computer पर `/opt/homebrew/opt/libpq/bin` में मिल गए हैं। Shell में `export PATH="/opt/homebrew/opt/libpq/bin:$PATH"` करें, या automation उपयोग करें जो यह location जानता है। Source 18.6 के लिए पुराना pg_dump उपयोग न करें।

पहले rehearsal करें। Final transfer में school staff को data entry रोकने दें, Express/Vite app और fee/background jobs रोकें, लेकिन local PostgreSQL चालू रखें। `npm run dev` रोकने पर उसका managed database भी बंद हो सकता है; ऐसे में दूसरे Terminal में `npm run db:start` से **सिर्फ local database** चलाएँ। यह तब तक करें जब तक `.env` local database पर है। Migration के दौरान दोनों databases पर समानांतर काम न करें।

एक private backup directory बनाएँ:

```sh
umask 077
mkdir -p backups
SCHOOL_BACKUP_DIR="backups/supabase-$(date +%Y%m%d-%H%M%S)"
mkdir "$SCHOOL_BACKUP_DIR"
cp .env "$SCHOOL_BACKUP_DIR/local.env"
tar -czf "$SCHOOL_BACKUP_DIR/uploads.tar.gz" uploads
```

दो database archives बनाएँ। `-W` local database password prompt करेगा; password `.env` या `data/postgres-local.json` में निजी रूप से देखें। नीचे host/user/database/port वर्तमान local configuration के हैं।

```sh
pg_dump -h 127.0.0.1 -p 55432 -U school -d openmind -W \
  --format=custom --no-owner --no-privileges \
  --file="$SCHOOL_BACKUP_DIR/local-full.dump"

pg_dump -h 127.0.0.1 -p 55432 -U school -d openmind -W \
  --format=custom --data-only --schema=public \
  --exclude-table='public._prisma_migrations' \
  --no-owner --no-privileges --quote-all-identifiers \
  --file="$SCHOOL_BACKUP_DIR/school-data.dump"

pg_restore --list "$SCHOOL_BACKUP_DIR/school-data.dump"
```

हर command सफल होने पर ही अगला चलाएँ। Full dump rollback/recovery के लिए है। Data-only dump Supabase की migration-created tables में जाएगा; `_prisma_migrations` target पर Prisma स्वयं बनाएगा। Archive list में सभी 26 application tables के TABLE DATA entries और migration table का exclusion जाँचें। Full backup में sensitive school data और password hashes हैं; इसे private/off-device backup में सुरक्षित रखें। [Dump options](https://www.postgresql.org/docs/current/app-pgdump.html)

Running `data/postgres` folder की सामान्य file copy को verified database backup न मानें। Restore rehearsal के लिए full dump को अलग PostgreSQL 18 database में restore करके जाँचें।

## 6 Supabase में schema बनाएँ

Supabase Data API बंद होने की पुष्टि करें। Target नया हो: application की कोई existing populated table नहीं होनी चाहिए। पहले से school data मिले तो यह empty-target runbook रोकें और reconciliation plan बनाएँ।

इन चार repository migrations का उपयोग होगा:

1. `202611060001_initial`
2. `20261106050044_finance_settings`
3. `202611130001_draft_student_fees`
4. `202611130002_fee_office`

नीचे command `.env.supabase` को सिर्फ migration subprocess के लिए पढ़ता है। Existing `.env` नहीं बदलता। Run करने से पहले `.env.supabase` में target hostname/project ref जाँचें।

```sh
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {spawnSync} from 'node:child_process';
const target = parse(readFileSync('.env.supabase'));
if (!target.DATABASE_URL) throw new Error('Missing target DATABASE_URL');
const url = new URL(target.DATABASE_URL);
if (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432') {
  throw new Error('This runbook expects the Supabase session pooler on 5432');
}
console.log('Migration target:', url.hostname, url.pathname);
const result = spawnSync(process.execPath,
  ['scripts/prisma.mjs', 'migrate', 'deploy'],
  {stdio: 'inherit', env: {...process.env, ...target}});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
NODE
```

Supabase Table Editor में `public` schema की tables दिखनी चाहिए। `migrate deploy` चलाने से पुराने local records copy नहीं होते। अभी `npm run seed`, fee initialization या fee schedule import न चलाएँ; ये records पुराने data के साथ आएँगे।

Shared target पर `prisma migrate reset`, `db push --accept-data-loss` या `migrate dev` उपयोग न करें। Target schema का source repository migrations ही रखें।

## 7 पुराने records restore करें

App और background jobs बंद रहें। Target की 26 application tables empty हों; `_prisma_migrations` में चार successful migrations होना सही है।

नीचे `PROJECT_REF` और `EXACT_POOLER_HOST` को Connect dialog के values से बदलें। URI में password नहीं है; `-W` Supabase database password अलग prompt करेगा। यह pg_restore URI है, इसलिए इसमें Prisma-only `schema` या `connection_limit` parameters न जोड़ें।

```sh
pg_restore \
  --dbname='postgresql://postgres.PROJECT_REF@EXACT_POOLER_HOST:5432/postgres?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt' \
  --password --data-only --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  "$SCHOOL_BACKUP_DIR/school-data.dump"
```

यह command केवल खाली target के लिए है। Single transaction से failure पर partial import commit नहीं होना चाहिए। Success के बाद दोबारा restore न चलाएँ: duplicate IDs आएँगी। किसी error पर constraints/triggers disable करके आगे न बढ़ें; version, dependency और target contents जाँचें। `--clean`, `DROP SCHEMA` या Supabase-managed schemas restore करने की जरूरत नहीं है। [Restore options](https://www.postgresql.org/docs/18/app-pgrestore.html)

PostgreSQL version mismatch पर पहले rehearsal ठीक करें; unsupported SQL को अंधाधुंध हटाना या errors ignore करना acceptable validation नहीं है। पुराने database को final acceptance तक सुरक्षित रखें।

## 8 Data मिलान

Final backup से ठीक पहले local database और restore के बाद Supabase में वही read-only queries चलाकर results मिलाएँ। Local के लिए `psql -h 127.0.0.1 -p 55432 -U school -d openmind -W`; Supabase के लिए SQL Editor उपयोग कर सकते हैं।

पहले सभी public table counts निकालें। यह query वास्तविक COUNT करती है; planner estimates नहीं:

```sql
select t.tablename,
       (xpath('/row/n/text()', query_to_xml(
         format('select count(*) as n from public.%I', t.tablename),
         false, true, '')))[1]::text::bigint as row_count
from pg_tables t
where t.schemaname = 'public'
  and t.tablename <> '_prisma_migrations'
order by t.tablename;
```

```sql
select module, count(*) from public."Entry" group by module order by module;

select 'Invoice' as item, count(*) as records, coalesce(sum(amount),0) as paise
from public."Invoice"
union all
select 'Payment', count(*), coalesce(sum(amount),0) from public."Payment"
union all
select 'Refund', count(*), coalesce(sum(amount),0) from public."Refund"
union all
select 'FeeCollection', count(*), coalesce(sum(amount),0) from public."FeeCollection";

select migration_name, finished_at is not null as finished, rolled_back_at
from public."_prisma_migrations" order by migration_name;
```

Counts और totals के साथ IDs, dates, JSON data, payment verification status और selected complete records मिलाएँ। User password hashes बराबर होने चाहिए; hashes को logs/chat में print नहीं करना है। `_prisma_migrations` के generated IDs/timestamps का बराबर होना जरूरी नहीं; migration names, checksums और successful status समान होना चाहिए। Rehearsal में canonical row-content comparison/hash से सभी 26 tables का data मिलाना बेहतर है।

फिर verify करें: 512 student drafts, उनके class/attendance links, pending verification, invoice, fee rates, user roles, document link, activity और audit history। Final baseline बदल चुका हो तो audit वाले पुराने counts की जगह fresh baseline लें।

## 9 Files और Supabase Storage

`Document` table केवल metadata/path रखती है। असली bytes `uploads/` में हैं। Database transfer के बाद उसी computer और project path पर app चलाने से files उपलब्ध रह सकती हैं। दूसरे server पर `uploads` restore करें और `Document.path` के absolute paths नए server से मिलाएँ। Download करके file size/content checksum verify करें।

अगर files भी Supabase में रखनी हैं, यह अलग implementation चरण है:

1. Storage में `school-documents` नाम का **private** bucket बनाएँ।
2. App की मौजूदा limit के अनुसार maximum 5 MB और PDF/JPEG/PNG रखें।
3. Backend में Supabase Storage client तथा server-only credential configure करें। Database password Storage API key नहीं होता।
4. `server/app.ts` और `server/student-profiles.ts` के upload और download routes बदलें। Files के लिए bucket/object key store करने की स्पष्ट strategy बनाएँ।
5. हर request पर मौजूदा school role/ownership checks के बाद server download या short-lived signed URL दें। Current app session को Supabase Auth JWT न समझें।
6. Existing file upload करें, bytes/checksum मिलाएँ, document ID और `Entry.studentDocuments` links बनाए रखें; फिर read path switch करें।

केवल bucket बनाने या env key जोड़ने से current code files वहाँ upload नहीं करेगा। Private documents के लिए public bucket न करें। [Storage access model](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## 10 Application को Supabase पर switch करें

Backup, restore और verification सफल होने पर `.env` में **सिर्फ database connection तथा जरूरी local runtime settings** बदलें। Other provider secrets सुरक्षित रखें; पूरी `.env` को staging example से overwrite न करें।

```sh
npm run db:generate
node scripts/prisma.mjs migrate status
npm run dev
```

पहले से local preview चल रहा हो तो उसकी process रोककर restart करें; `.env` बदलना पुराने connection को अपने-आप नहीं बदलता। अब `npm run dev` remote database check करेगा; local database auto-start नहीं करेगा।

- App: http://127.0.0.1:5173/
- Health: http://127.0.0.1:5173/api/health
- Expected health: `{"ok":true,"database":"connected"}`

Existing admin से sign in करें। Student drafts, attendance, invoice, fee settings और file download खोलें। Database-backed record save/read check पहले rehearsal environment में करें। Live fees में fake payments न बनाएँ। Supabase में rows दिखना, app login चलना और document download—तीनों की अलग जाँच करें।

`npm run seed` **नहीं** चलाना है। यह empty installation में नया administrator बनाने के लिए है और existing users होने पर refuse करता है।

## 11 Production के लिए बाकी requirements

- Supabase database लगाने से website public नहीं होती। React assets और Express API के लिए hosting अभी भी चाहिए। Existing reminder job persistent Node process पर चलता है; serverless में separate scheduler चाहिए।
- Current `compose.yaml` अपना `db` container और hardcoded local database URL उपयोग करता है। Supabase deployment के लिए app environment, database dependency और persistent uploads strategy अलग update करनी होगी। Existing compose command को unchanged चलाने से Supabase उपयोग नहीं होगा।
- Production में HTTPS, सही `APP_ORIGIN`, `NODE_ENV=production` और वास्तविक reverse proxy के अनुसार `TRUST_PROXY` रखें। Current production login cookies Secure हैं।
- Production runtime के लिए limited database role और separate migration/admin credential बनाना उचित है। Runtime role को school tables की आवश्यक permissions दें; role changes के बाद सभी workflows validate करें। यह guide dashboard का initial postgres connection लेकर setup समझाती है।
- Data API भविष्य में enable करने से पहले table grants और RLS policies design करें। Current Express user roles अपने-आप Supabase RLS नहीं बनते।
- Supabase backup/retention की उपलब्धता dashboard में अपने plan के अनुसार जाँचें। Database और uploaded file bytes दोनों का backup तथा restore rehearsal रखें।
- Tests local/isolated database पर चलाएँ। Existing test scripts temporary schemas बनाते और हटाते हैं; shared live school database को test target न बनाएं।

Serverless deployment चुना जाए तो transaction pooler `6543` और Prisma 6 के लिए `pgbouncer=true` उपयोग की योजना बनेगी। Migration के लिए session/direct connection अलग रखें। Current schema में `directUrl = env("DIRECT_URL")` जोड़ना और सभी environments में वह variable देना पड़ेगा; सिर्फ `.env` में DIRECT_URL लिखने से current app इसे इस्तेमाल नहीं करेगा। अभी local/persistent-server session pooler वाला मार्ग पर्याप्त है। [Prisma integration](https://supabase.com/docs/guides/database/prisma)

## 12 सामान्य errors

| Error / लक्षण | क्या जाँचें |
| --- | --- |
| P1001 / database unreachable | Project ready/paused status, exact host, network, Session pooler 5432; direct IPv6 connection की जगह IPv4 session pooler |
| Password authentication failed | Database password, username में project ref, URI encoding |
| Cannot connect to configured database | Network/credentials जाँचें; startup checker remote connections के लिए 15 सेकंड और local के लिए 2 सेकंड रखता है |
| Relation does not exist | Target migrations पूरी हैं या गलत database/schema चुना है |
| Prepared statement error | Transaction pooler गलती से चुना है या उसके लिए pgbouncer config नहीं है |
| Too many connections / pool timeout | Prisma pool size और कुल app instances; persistent server पर प्रारंभिक limit 5 |
| TLS / certificate error | Supabase SSL instructions, driver और CA configuration; globally TLS verification बंद न करें |
| Duplicate key during restore | Target खाली नहीं था या restore दोबारा चला; clean/reset करने से पहले data जाँचें |
| Foreign key violation | Complete data dump, original IDs, dependency order और schema version जाँचें |
| Students नहीं दिखते लेकिन Student table खाली है | Entry में studentDrafts और permissions/filters जाँचें |
| Login नहीं होता | User/Session data, password hash, account active state, role और development/production cookies |
| Files नहीं खुलतीं | uploads bytes, Document.path और permissions; database-only backup पर्याप्त नहीं |
| Supabase Auth users खाली | Expected: इस app के accounts public.User में हैं |

## 13 Rollback

Acceptance से पहले समस्या आए तो app रोकें, private backup से पुराना `DATABASE_URL` वापस रखें और local app restart करें। Local database तथा uploads delete न करें।

Supabase पर नए real records लिखे जा चुके हों तो सीधे पुराने local database पर लौटने से वे नए records गायब दिखेंगे। पहले दोनों तरफ writes रोकें, Supabase का नया backup लें और नए records reconcile करें। केवल URL बदलना बाद के writes का rollback नहीं है।

## 14 अब उपयोग कैसे करें

1. चल रहे local app को खोलें: http://127.0.0.1:5173/#/login/admin । Existing school account से login करें।
2. Computer/app restart होने पर project folder में `npm run dev` चलाएँ और Terminal खुला रखें। Supabase access के लिए internet चाहिए।
3. Students, fees, attendance या accounts में save किए गए records अब Supabase में रहते हैं। Supabase Table Editor में `public` schema देखें; student drafts `Entry` में हैं।
4. नई code migration के लिए `npm run db:migrate` उपयोग करें। Status के लिए `node scripts/prisma.mjs migrate status`।
5. यह अभी local website है। Public hosting, Supabase Storage और अलग production scheduler अभी configure नहीं किए गए हैं।
6. Current Data API बंद रखें: app अपने Express API और existing access checks उपयोग करता है।

Validation: production build, दोनों isolated startup tests, सभी 26 tables का complete data comparison, Prisma read/write/rollback और document file presence पास हुए। Final backup को private रखें।

## 15 Vercel पर database-connected preview deploy करें

Repository `asjadmldev-cell/Open-mind-` import करें। Framework Vite, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`, Install Command `npm ci --include=dev` रखें। Existing `api/index.ts` Express API serve करता है। `vercel.json` में public CA certificate को function bundle में शामिल किया गया है।

इस computer पर ignored private `.env.vercel` तैयार है। इसमें DATABASE_URL का password पहले से URI-encoded है, Transaction pooler port 6543, connection limit 2 और certificate का portable path `certs/supabase-ca.crt` है। Local `.env` वाला Mac-specific path Vercel में paste न करें। `.env.vercel` को GitHub पर upload न करें।

Vercel के Environment Variables में Production environment के लिए:

| Name | Value |
| --- | --- |
| DATABASE_URL | Private `.env.vercel` में इसी नाम की पूरी value; surrounding quotes न लें |
| NODE_ENV | production |
| TRUST_PROXY | 1 |
| APP_ORIGIN | Deployment का वास्तविक https URL; domain मिलने के बाद जोड़कर redeploy करें |

पहले deploy पर APP_ORIGIN उपलब्ध न हो तो खाली छोड़ सकते हैं: app उसी hostname से आए requests भी allow करता है। Preview environment को इसी school database से जोड़ने पर preview भी real records बदलेगा; उसे अलग database देने की योजना रखें।

Deploy के बाद `https://ACTUAL-DOMAIN/api/health` में `{"ok":true,"database":"connected"}` जाँचें, फिर `https://ACTUAL-DOMAIN/#/login/admin` पर existing school credentials से login करें। Supabase database password login form में नहीं डालना है। Environment variables बदलने के बाद नया deployment/redeploy जरूरी है। [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)

Publishable key, service-role key, ADMIN_PASSWORD, PORT और VITE_DATABASE_URL इस deployment के लिए आवश्यक नहीं हैं। Database migrations पहले से लागू हैं; build में seed/reset/import commands न लगाएँ। File uploads के लिए durable Storage और automatic fee reminders के लिए scheduler अभी बाकी हैं; यह configuration उन सुविधाओं को अपने-आप पूरा नहीं करती।

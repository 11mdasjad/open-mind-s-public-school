import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Leaf,
  Play,
  Home,
  Grid2X2,
  Heart,
  Images,
  Menu,
  X,
  Check,
  Search,
  ChevronRight,
  Mail,
  MapPin,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "./api";
import { HomePage } from "./HomePage";
import {LoginPage} from "./LoginPage";
import {isPortalRoute,portalHome,portalForRole,portalKinds,portalTab} from "../shared/portals";
import { publicPages } from "../shared/modules";
const Portal = lazy(() =>
  import("./Portal").then((m) => ({ default: m.Portal })),
);
export function Brand() {
  return (
    <a href="#/" className="brand">
      <img className="school-logo" src="/images/school-logo.jpeg" alt="Open Mind's Public School logo" width={48} height={48} />
      <span>
        OPEN MIND'S<small>PUBLIC SCHOOL</small>
      </span>
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,textarea,[tabindex="0"]',
          ) || [],
        ).filter((e) => !e.hasAttribute("disabled"));
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">OPEN MIND'S PUBLIC SCHOOL</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [content, setContent] = useState<any>({
    pages: publicPages,
    notices: [],
    events: [],
  });
  const [modal, setModal] = useState("");
  const [user, setUser] = useState<any>(null);
  const [setup, setSetup] = useState(false);
  const [authReady,setAuthReady]=useState(false);
  const [menu, setMenu] = useState(false);
  const [gallery, setGallery] = useState(0);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "/");
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    api("/public")
      .then(setContent)
      .catch(() => {});
    Promise.all([
      api("/setup").then(d=>setSetup(d.required)).catch(()=>{}),
      api("/auth/me").then(d=>setUser(d.user)).catch(()=>{})
    ]).finally(()=>setAuthReady(true));
    return () => {window.removeEventListener("hashchange", change);window.removeEventListener("popstate",change)};
  }, []);
  useEffect(()=>{
    if(!authReady||!isPortalRoute(route))return;
    if(route==='/parent'||route.startsWith('/parent/')){location.hash='/login/parent';return;}
    const requested=route.split('/')[1];
    if(!user){location.hash=`/login/${portalKinds.includes(requested as any)?requested:'admin'}`;return;}
    if(requested!==portalForRole(user.role))location.hash=portalHome(user.role,requested==='portal'?portalTab(route):'overview');
  },[route,user,authReady]);
  useEffect(()=>{if(!isPortalRoute(route))api('/public').then(setContent).catch(()=>{})},[route]);
  function portal(){location.hash=user?portalHome(user.role):'/login/admin';}
  const authRoute=route.startsWith('/login')||route==='/setup'||route.startsWith('/activate/');
  if((authRoute||isPortalRoute(route))&&!authReady)return <div className="app-loading">Opening your school portal…</div>;
  if(authRoute||(isPortalRoute(route)&&!user))return <LoginPage route={authRoute?route:`/login/${route.split('/')[1]}`} setupAvailable={setup} onSuccess={u=>{setUser(u);setSetup(false);setModal('')}}/>;
  const page = route.split("/")[1] || "home";
  const main = content.pages[page] || publicPages.about;
  const photos = [
    {
      src: "/images/campus.jpg",
      title: "Room to grow",
      text: "Campus inspiration",
    },
    {
      src: "/images/library.jpg",
      title: "A world between pages",
      text: "Library inspiration",
    },
    {
      src: "/images/classroom.jpg",
      title: "Learning together",
      text: "Classroom inspiration",
    },
  ];
  return (
    <>
      {isPortalRoute(route) && user ? (
        <Suspense
          fallback={
            <div className="app-loading">Opening your school workspace…</div>
          }
        >
          <Portal
            route={route}
            user={user}
            onLogout={() => {
              setUser(null);
              location.hash = `/login/${portalForRole(user.role)}`;
            }}
          />
        </Suspense>
      ) : (
        <div className="site-wrap edu-site">
          <div className="ambient" />
          <div className="school-site">
            <header className="site-header">
              <Brand />
              <nav
                className={menu ? "public-nav mobile-open" : "public-nav"}
                aria-label="Main navigation"
              >
                {[
                  ["Home", "/"],
                  ["Our school", "/about"],
                  ["Learning", "/academics"],
                  ["School life", "/facilities"],
                  ["Contact", "/contact"],
                ].map(([label, url]) => (
                  <a
                    className={route === url ? "active" : ""}
                    href={`#${url}`}
                    key={url}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <div className="header-actions">
                <button className="portal-link" onClick={portal}>
                  <LockKeyhole size={14} />
                  School portal
                </button>
                <button
                  className="button dark header-apply"
                  onClick={() => setModal("admission")}
                >
                  Admissions{" "}
                  <span className="circle">
                    <ArrowUpRight size={17} />
                  </span>
                </button>
                <button
                  className="icon-button menu-button"
                  aria-label="Toggle navigation"
                  onClick={() => setMenu(!menu)}
                >
                  {menu ? <X /> : <Menu />}
                </button>
              </div>
            </header>
            {page === "home" ? (
              <HomePage onAdmission={()=>setModal('admission')} onTour={()=>setModal('tour')} onPortal={portal} notices={content.notices}/>
            ) : (
              <section className="inner-page section-padding">
                <a className="back-link" href="#/">
                  <ArrowLeft size={16} /> Back to home
                </a>
                <span className="eyebrow">OPEN MIND'S PUBLIC SCHOOL</span>
                <h1>
                  {page === "news"
                    ? "The school notice board."
                    : page === "gallery"
                      ? "A glimpse of possibility."
                      : main.title}
                </h1>
                <p className="page-intro">{main.body}</p>
                {page === "news" ? (
                  <div className="news-grid">
                    {[...content.notices, ...content.events].map((n: any) => (
                      <article key={n.id}>
                        <span className="eyebrow">
                          {n.data.publishDate || n.data.date}
                        </span>
                        <h3>{n.title}</h3>
                        <p>{n.data.body || n.data.description}</p>
                      </article>
                    ))}
                    {!content.notices.length && !content.events.length && (
                      <p>No published notices or events yet.</p>
                    )}
                  </div>
                ) : page === "gallery" ? (
                  <div className="gallery-grid">
                    {photos.map((p, i) => (
                      <button
                        key={p.src}
                        onClick={() => {
                          setGallery(i);
                          setModal("gallery");
                        }}
                      >
                        <img src={p.src} alt={p.title} />
                        <h3>{p.title}</h3>
                        <small>Illustrative photograph</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="inner-feature">
                      <img
                        src={
                          page === "academics"
                            ? "/images/classroom.jpg"
                            : page === "facilities"
                              ? "/images/library.jpg"
                              : "/images/campus.jpg"
                        }
                        alt="Illustrative education photograph"
                      />
                      <span>
                        Illustrative imagery · School details to be confirmed by
                        the administration
                      </span>
                    </div>
                    <div className="inner-actions">
                      <button
                        className="button dark"
                        onClick={() => setModal("admission")}
                      >
                        {page === "admissions"
                          ? "Start an enquiry"
                          : "Let’s talk about your child’s future"}
                        <ArrowUpRight size={18} />
                      </button>
                      {page === "admissions" && (
                        <button
                          className="button light"
                          onClick={() => setModal("tracking")}
                        >
                          Track an application <Search size={16} />
                        </button>
                      )}
                      {page === "facilities" && (
                        <a className="button light" href="#/gallery">
                          View gallery <Images size={16} />
                        </a>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="admission-banner">
              <div>
                <span className="eyebrow">THEIR NEXT CHAPTER STARTS HERE</span>
                <h2>
                  A world of possibility.
                  <br />
                  <em>One open mind.</em>
                </h2>
              </div>
              <button
                className="button cream"
                onClick={() => setModal("admission")}
              >
                Enquire about admissions <ArrowUpRight size={20} />
              </button>
            </section>
            <footer>
              <div className="footer-main">
                <div>
                  <Brand />
                  <p>
                    Curious minds. Kind hearts.
                    <br />
                    Confident futures.
                  </p>
                </div>
                <div>
                  <span className="eyebrow">EXPLORE</span>
                  <a href="#/about">Our school</a>
                  <a href="#/academics">Academics</a>
                  <a href="#/facilities">School life</a>
                  <a href="#/gallery">Gallery</a>
                </div>
                <div>
                  <span className="eyebrow">CONNECT</span>
                  <a href="#/admissions">Admissions</a>
                  <a href="#/contact">Contact us</a>
                  <a href="#/careers">Careers</a>
                  <a href="#/downloads">Downloads</a>
                </div>
                <div>
                  <span className="eyebrow">YOUR SCHOOL, CONNECTED</span>
                  <p>
                    One place for students, families
                    <br />
                    and our school team.
                  </p>
                  <button className="underlined-link" onClick={portal}>
                    Enter school portal <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
              <div className="footer-bottom">
                <span>
                  © {new Date().getFullYear()} Open Mind's Public School
                </span>
                <span>
                  <a href="#/privacy">Privacy</a>
                  <a href="#/terms">Terms of use</a>
                  <span>Made for curious minds.</span>
                </span>
              </div>
            </footer>
          </div>
        </div>
      )}
      <AnimatePresence>
        {modal && (
          <Modal
            title={
              modal === "admission"
                ? "Let’s begin their next chapter."
                : modal === "login"
                  ? "Welcome back."
                  : modal === "setup"
                    ? "Welcome to your school."
                    : modal === "activate"
                      ? "Set your password."
                      : modal === "tracking"
                        ? "Track your application."
                        : modal === "gallery"
                          ? photos[gallery].title
                          : "A little glimpse of Open Mind's Public School."
            }
            onClose={() => setModal("")}
            wide={["gallery", "tour"].includes(modal)}
          >
            {modal === "admission" ? (
              <Admission />
            ) : modal === "tracking" ? (
              <Tracking />
            ) : modal === "gallery" ? (
              <>
                <img
                  className="gallery-image"
                  src={photos[gallery].src}
                  alt={photos[gallery].text}
                />
                <div className="gallery-controls">
                  <span>{photos[gallery].text} · Illustrative stock image</span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Previous image"
                      onClick={() => setGallery((gallery + 2) % 3)}
                    >
                      <ArrowLeft size={19} />
                    </button>
                    <span>{gallery + 1} / 3</span>
                    <button
                      className="icon-button"
                      aria-label="Next image"
                      onClick={() => setGallery((gallery + 1) % 3)}
                    >
                      <ArrowRight size={19} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="tour-content">
                <img src="/images/classroom.jpg" alt="Illustrative classroom" />
                <p>
                  Open Mind's Public School is a place for curiosity, thoughtful questions and
                  the confidence to grow. Explore our vision for learning, or
                  connect with the school to arrange a visit and discover the
                  actual campus.
                </p>
                <small>
                  Website imagery includes illustrative stock photography and original AI-generated portraits.
                </small>
                <button
                  className="button dark"
                  onClick={() => setModal("admission")}
                >
                  Arrange a conversation <ArrowRight size={16} />
                </button>
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
function Admission() {
  const [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return result ? (
    <div className="admission-success">
      <span>
        <Check size={27} />
      </span>
      <h3>A new beginning. We’re glad you’re here.</h3>
      <p>Your enquiry is saved. Keep this reference to track its progress:</p>
      <strong>{result}</strong>
      <p className="form-note">
        The school team can review your enquiry in the admissions portal.
      </p>
    </div>
  ) : (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await api(
            "/admissions",
            "POST",
            Object.fromEntries(new FormData(e.currentTarget)),
          );
          setResult(r.reference);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="form-intro">
        Tell us a little about your child. We’ll help you explore the next step.
      </p>
      <div className="form-grid">
        <label>
          Child’s name
          <input name="childName" required />
        </label>
        <label>
          Parent / guardian name
          <input name="parentName" required />
        </label>
        <label>
          Email address
          <input name="email" type="email" required />
        </label>
        <label>
          Phone number
          <input
            name="phone"
            type="tel"
            minLength={7}
            maxLength={20}
            required
          />
        </label>
        <label className="span-2">
          Class of interest
          <select name="className" required>
            <option value="">Select a class</option>
            {[
              "Nursery",
              "LKG",
              "UKG",
              ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Anything you’d like us to know?{" "}
          <span className="optional">Optional</span>
          <textarea name="message" rows={3} maxLength={3000} />
        </label>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" required /> I agree to the use of these details
        to respond to my enquiry.
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark full" disabled={busy}>
        {busy ? "Saving your enquiry…" : "Send admission enquiry"}
        <ArrowUpRight size={18} />
      </button>
      <p className="form-note">
        Submitting an enquiry does not confirm admission or reserve a seat.
      </p>
    </form>
  );
}
function Tracking() {
  const [result, setResult] = useState<any>(),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setResult(null);
        try {
          setResult(
            await api(
              "/admission-status",
              "POST",
              Object.fromEntries(new FormData(e.currentTarget)),
            ),
          );
        } catch (e: any) {
          setError(e.message);
        }
      }}
    >
      <label>
        Application reference
        <input name="reference" required placeholder="OM-…" />
      </label>
      <label>
        Email used in the enquiry
        <input type="email" name="email" required />
      </label>
      <button className="button dark full">
        Check status <ArrowRight size={16} />
      </button>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="success-box">
          <h3>{result.childName}</h3>
          <p>
            Application status: <strong>{result.status}</strong>
          </p>
        </div>
      )}
    </form>
  );
}

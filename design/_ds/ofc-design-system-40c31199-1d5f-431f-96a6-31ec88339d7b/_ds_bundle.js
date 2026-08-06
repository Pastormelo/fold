/* @ds-bundle: {"format":3,"namespace":"DesignSystem_40c311","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"SectionHeading","sourcePath":"components/core/SectionHeading.jsx"},{"name":"EventCard","sourcePath":"components/patterns/EventCard.jsx"},{"name":"SermonCard","sourcePath":"components/patterns/SermonCard.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"cb7a8c9596b1","components/core/Badge.jsx":"5aa0cce67c24","components/core/Button.jsx":"708f4ffd9891","components/core/Card.jsx":"8085135306b8","components/core/Input.jsx":"9bb1505607f3","components/core/SectionHeading.jsx":"5fba8241c038","components/patterns/EventCard.jsx":"d2c08ff79e70","components/patterns/SermonCard.jsx":"e1d93a349258","ui_kits/website/App.jsx":"52f3781d42cd","ui_kits/website/GiveView.jsx":"86923664cc17","ui_kits/website/HomeView.jsx":"b916a30c9ae4","ui_kits/website/Icon.jsx":"f11b9dbc94e1","ui_kits/website/SermonsView.jsx":"ebf506be1549","ui_kits/website/SiteFooter.jsx":"b75d36aa6a21","ui_kits/website/SiteHeader.jsx":"4573dfaf0424"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_40c311 = window.DesignSystem_40c311 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const dims = {
  sm: 32,
  md: 44,
  lg: 64
};

/**
 * Circular avatar — image or initials fallback.
 */
function Avatar({
  src = null,
  name = '',
  size = 'md',
  style = {},
  ...rest
}) {
  const d = dims[size] || dims.md;
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      borderRadius: 'var(--radius-pill)',
      overflow: 'hidden',
      background: 'var(--ofc-orange-100)',
      color: 'var(--ofc-orange-700)',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: d * 0.36,
      flexShrink: 0,
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials || '?');
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Small status / category pill.
 */
function Badge({
  variant = 'neutral',
  children,
  style = {},
  ...rest
}) {
  const variants = {
    neutral: {
      background: 'var(--ofc-n-100)',
      color: 'var(--text-secondary)'
    },
    brand: {
      background: 'var(--brand-soft)',
      color: 'var(--ofc-orange-700)'
    },
    ink: {
      background: 'var(--ofc-ink)',
      color: 'var(--text-inverse)'
    },
    blue: {
      background: 'var(--ofc-blue-pale)',
      color: '#1E6373'
    },
    success: {
      background: '#E4F3EB',
      color: '#256B45'
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: '11px',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '5px 11px',
      borderRadius: 'var(--radius-pill)',
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sizes = {
  sm: {
    padding: '8px 16px',
    fontSize: '13px'
  },
  md: {
    padding: '12px 24px',
    fontSize: '15px'
  },
  lg: {
    padding: '16px 32px',
    fontSize: '17px'
  }
};

/**
 * One Family Church button. Geometric, confident, tracked label.
 */
function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  children,
  style = {},
  ...rest
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    lineHeight: 1,
    border: '2px solid transparent',
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: full ? '100%' : 'auto',
    transition: 'background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
    opacity: disabled ? 0.5 : 1,
    ...sizes[size]
  };
  const variants = {
    primary: {
      background: 'var(--brand)',
      color: 'var(--on-brand)',
      boxShadow: 'var(--shadow-sm)'
    },
    secondary: {
      background: 'var(--ofc-ink)',
      color: 'var(--text-inverse)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-brand)'
    }
  };
  const hovers = {
    primary: {
      background: 'var(--brand-hover)',
      transform: 'translateY(-1px)',
      boxShadow: 'var(--shadow-brand)'
    },
    secondary: {
      background: 'var(--ofc-charcoal)',
      transform: 'translateY(-1px)'
    },
    outline: {
      borderColor: 'var(--brand)',
      color: 'var(--text-brand)'
    },
    ghost: {
      background: 'var(--brand-soft)'
    }
  };
  const [hover, setHover] = React.useState(false);
  const composed = {
    ...base,
    ...variants[variant],
    ...(hover && !disabled ? hovers[variant] : {}),
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    style: composed,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'translateY(0) scale(0.98)';
    },
    onMouseUp: e => {
      if (!disabled) e.currentTarget.style.transform = hover ? 'translateY(-1px)' : 'none';
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card surface — soft elevation, modest radius. Optional cover image.
 */
function Card({
  image = null,
  imageAlt = '',
  interactive = false,
  padding = '24px',
  children,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: interactive && hover ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: interactive && hover ? 'translateY(-3px)' : 'none',
      transition: 'box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)',
      cursor: interactive ? 'pointer' : 'default',
      ...style
    }
  }, rest), image && /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '16 / 10',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: imageAlt,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      transform: interactive && hover ? 'scale(1.04)' : 'scale(1)',
      transition: 'transform var(--dur-slow) var(--ease-out)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding
    }
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input with optional label. Brand focus ring.
 */
function Input({
  label = null,
  hint = null,
  type = 'text',
  style = {},
  id,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: '12px',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: '15px',
      color: 'var(--text-primary)',
      background: 'var(--surface-card)',
      padding: '12px 14px',
      border: `1px solid ${focus ? 'var(--brand)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
      ...style
    }
  }, rest)), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: 'var(--text-muted)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/SectionHeading.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Section heading block — optional tracked overline + title + intro.
 */
function SectionHeading({
  overline = null,
  title,
  intro = null,
  align = 'left',
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      textAlign: align,
      alignItems: align === 'center' ? 'center' : 'flex-start',
      maxWidth: align === 'center' ? '640px' : 'none',
      margin: align === 'center' ? '0 auto' : '0',
      ...style
    }
  }, rest), overline && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: '13px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, overline), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      margin: 0,
      fontSize: 'var(--text-h2)',
      lineHeight: 'var(--lh-snug)',
      letterSpacing: 'var(--ls-tight)',
      color: 'var(--text-primary)'
    }
  }, title), intro && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-lead)',
      lineHeight: 'var(--lh-relaxed)',
      color: 'var(--text-secondary)'
    }
  }, intro));
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/patterns/EventCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Event / service card with date chip.
 */
function EventCard({
  title,
  date,
  time,
  location,
  tag = null,
  image = null,
  style = {},
  ...rest
}) {
  const [day, month] = Array.isArray(date) ? date : [date, ''];
  return /*#__PURE__*/React.createElement(__ds_scope.Card, _extends({
    interactive: true,
    image: image,
    imageAlt: title,
    padding: "0",
    style: style
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '16px',
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      width: 58,
      textAlign: 'center',
      background: 'var(--brand-soft)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 0',
      alignSelf: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 24,
      lineHeight: 1,
      color: 'var(--ofc-orange-700)'
    }
  }, day), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--ofc-orange-600)',
      marginTop: 4
    }
  }, month)), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, tag && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    variant: "brand"
  }, tag)), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 8px',
      fontSize: 18,
      lineHeight: 1.2
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, time && /*#__PURE__*/React.createElement("span", null, time), location && /*#__PURE__*/React.createElement("span", null, location)))));
}
Object.assign(__ds_scope, { EventCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/EventCard.jsx", error: String((e && e.message) || e) }); }

// components/patterns/SermonCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Sermon media card — cover with play overlay, series + speaker meta.
 */
function SermonCard({
  title,
  series = null,
  speaker = null,
  date = null,
  image,
  duration = null,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      border: '1px solid var(--border-subtle)',
      boxShadow: hover ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: hover ? 'translateY(-3px)' : 'none',
      transition: 'box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)',
      cursor: 'pointer',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '16 / 9',
      overflow: 'hidden',
      background: 'var(--ofc-ink)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: title,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: 0.92,
      transform: hover ? 'scale(1.05)' : 'scale(1)',
      transition: 'transform var(--dur-slow) var(--ease-out)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg, rgba(32,36,42,0) 40%, rgba(32,36,42,0.55))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'var(--shadow-brand)',
      transition: 'transform var(--dur-base) var(--ease-out)',
      transformOrigin: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "var(--ofc-ink)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 5v14l11-7z"
  }))), duration && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      background: 'rgba(9,10,13,0.8)',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 12,
      padding: '3px 8px',
      borderRadius: 'var(--radius-xs)'
    }
  }, duration)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px'
    }
  }, series && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    variant: "brand"
  }, series)), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 6px',
      fontSize: 19,
      lineHeight: 1.2
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, speaker, speaker && date ? ' · ' : '', date)));
}
Object.assign(__ds_scope, { SermonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/SermonCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/App.jsx
try { (() => {
/* App shell — routes between Home / Sermons / Give. */
function App() {
  const [route, setRoute] = React.useState('home');
  const scrollRef = React.useRef(null);
  const navigate = r => {
    setRoute(r);
    if (scrollRef.current) scrollRef.current.scrollTo({
      top: 0
    });
  };
  const View = {
    home: window.HomeView,
    sermons: window.SermonsView,
    give: window.GiveView
  }[route];
  return /*#__PURE__*/React.createElement("div", {
    id: "scroll-root",
    ref: scrollRef,
    style: {
      height: '100vh',
      overflowY: 'auto',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(window.SiteHeader, {
    route: route,
    onNavigate: navigate
  }), /*#__PURE__*/React.createElement(View, {
    onNavigate: navigate
  }), /*#__PURE__*/React.createElement(window.SiteFooter, {
    onNavigate: navigate
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/GiveView.jsx
try { (() => {
/* Give view — generosity page with amount picker + frequency. */
function GiveView({
  onNavigate
}) {
  const {
    Button,
    Badge,
    SectionHeading,
    Input,
    Card
  } = window.DesignSystem_40c311;
  const Icon = window.Icon;
  const amounts = [25, 50, 100, 250];
  const [amt, setAmt] = React.useState(50);
  const [freq, setFreq] = React.useState('one');
  const [fund, setFund] = React.useState('General Fund');
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--ofc-ink)',
      paddingTop: 120,
      paddingBottom: 80
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ofc-orange-light)'
    }
  }, "Generosity"), /*#__PURE__*/React.createElement("h1", {
    style: {
      color: 'var(--ofc-paper)',
      fontSize: 'var(--text-h1)',
      margin: '14px 0 18px'
    }
  }, "Your giving moves the mission."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'rgba(244,251,254,0.82)',
      fontSize: 18,
      lineHeight: 1.65,
      maxWidth: 460,
      margin: 0
    }
  }, "Every gift fuels weekend services, cares for our city, and helps people far from God find their way home. Thank you for being generous."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28,
      marginTop: 36
    }
  }, [['$1.2M', 'given in 2025'], ['38', 'local partners'], ['100%', 'goes to ministry']].map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      color: 'var(--ofc-orange-light)'
    }
  }, s[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'rgba(244,251,254,0.7)'
    }
  }, s[1]))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 32,
      boxShadow: 'var(--shadow-xl)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 20px',
      fontSize: 22
    }
  }, "Make a gift"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: 'var(--surface-sunken)',
      borderRadius: 'var(--radius-pill)',
      padding: 4,
      marginBottom: 22
    }
  }, [['one', 'One-time'], ['month', 'Monthly']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setFreq(k),
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13.5,
      padding: '8px 22px',
      borderRadius: 'var(--radius-pill)',
      border: 'none',
      cursor: 'pointer',
      background: freq === k ? 'var(--surface-card)' : 'transparent',
      color: freq === k ? 'var(--text-primary)' : 'var(--text-muted)',
      boxShadow: freq === k ? 'var(--shadow-sm)' : 'none',
      transition: 'all var(--dur-fast)'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 10,
      marginBottom: 12
    }
  }, amounts.map(a => /*#__PURE__*/React.createElement("button", {
    key: a,
    onClick: () => setAmt(a),
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 17,
      padding: '14px 0',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      border: '2px solid ' + (amt === a ? 'var(--brand)' : 'var(--border-default)'),
      background: amt === a ? 'var(--brand-soft)' : 'var(--surface-card)',
      color: amt === a ? 'var(--ofc-orange-700)' : 'var(--text-primary)',
      transition: 'all var(--dur-fast)'
    }
  }, "$", a))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      fontWeight: 700,
      color: 'var(--text-muted)'
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    value: amt,
    onChange: e => setAmt(e.target.value.replace(/\D/g, '')),
    style: {
      width: '100%',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 18,
      padding: '14px 16px 14px 30px',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("select", {
    value: fund,
    onChange: e => setFund(e.target.value),
    style: {
      width: '100%',
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      padding: '13px 14px',
      marginBottom: 18,
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("option", null, "General Fund"), /*#__PURE__*/React.createElement("option", null, "Building Fund"), /*#__PURE__*/React.createElement("option", null, "Missions"), /*#__PURE__*/React.createElement("option", null, "Benevolence")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    full: true,
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "heart",
      size: 18
    })
  }, "Give $", amt || 0, freq === 'month' ? '/mo' : ''), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: '14px 0 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 13
  }), " Secure giving \xB7 powered by your church")))), /*#__PURE__*/React.createElement("section", {
    style: {
      paddingTop: 'var(--section-y)',
      paddingBottom: 'var(--section-y)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container"
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    align: "center",
    overline: "More Ways",
    title: "Give however works for you"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))',
      gap: 22,
      marginTop: 44
    }
  }, [{
    icon: 'smartphone',
    t: 'In the App',
    d: 'Give in seconds from the One Family app.'
  }, {
    icon: 'repeat',
    t: 'Set it & forget it',
    d: 'Schedule recurring gifts and never miss.'
  }, {
    icon: 'mail',
    t: 'By Mail',
    d: 'PO Box 4120, Austin TX 78704.'
  }, {
    icon: 'landmark',
    t: 'Stocks & More',
    d: 'Give assets, stock, or from a DAF.'
  }].map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 24,
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-soft)',
      color: 'var(--ofc-orange-600)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: w.icon,
    size: 20
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 6px',
      fontSize: 17
    }
  }, w.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: 'var(--text-secondary)',
      fontSize: 14.5,
      lineHeight: 1.55
    }
  }, w.d)))))));
}
window.GiveView = GiveView;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/GiveView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/HomeView.jsx
try { (() => {
/* Home view — hero, service info, next steps, latest message, events, ministries. */
function HomeView({
  onNavigate
}) {
  const {
    Button,
    Badge,
    SectionHeading,
    SermonCard,
    EventCard
  } = window.DesignSystem_40c311;
  const Icon = window.Icon;
  const Section = ({
    children,
    style
  }) => /*#__PURE__*/React.createElement("section", {
    style: {
      paddingTop: 'var(--section-y)',
      paddingBottom: 'var(--section-y)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container"
  }, children));
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--ofc-ink)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/images/cover-community.jpg",
    alt: "",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(110deg, rgba(32,36,42,0.92) 30%, rgba(32,36,42,0.45))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      position: 'relative',
      paddingTop: 120,
      paddingBottom: 120
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 660
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ofc-orange-light)'
    }
  }, "Welcome Home"), /*#__PURE__*/React.createElement("h1", {
    style: {
      color: 'var(--ofc-paper)',
      fontSize: 'var(--text-display)',
      fontWeight: 800,
      lineHeight: 1.04,
      margin: '16px 0 20px'
    }
  }, "You're not meant", /*#__PURE__*/React.createElement("br", null), "to do life alone."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'rgba(244,251,254,0.86)',
      fontSize: 20,
      lineHeight: 1.6,
      maxWidth: 520,
      margin: '0 0 32px'
    }
  }, "One Family Church is a community of ordinary people following Jesus together. Wherever you're starting from, there's room for you here."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "map-pin",
      size: 18
    }),
    onClick: () => onNavigate('home')
  }, "Plan Your Visit"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "play",
      size: 18
    }),
    onClick: () => onNavigate('sermons'),
    style: {
      background: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(4px)',
      color: 'var(--ofc-paper)'
    }
  }, "Watch Online"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      display: 'flex',
      gap: 40,
      flexWrap: 'wrap',
      padding: '28px 0'
    }
  }, [{
    icon: 'clock',
    t: 'Sundays',
    s: '9:00 & 11:00 AM'
  }, {
    icon: 'map-pin',
    t: 'Gather Here',
    s: '1200 Grace Blvd, Austin TX'
  }, {
    icon: 'baby',
    t: 'One Family Kids',
    s: 'Birth – 5th grade, every service'
  }, {
    icon: 'coffee',
    t: 'Come Early',
    s: 'Free coffee in The Commons'
  }].map((x, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flex: '1 1 200px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-soft)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ofc-orange-600)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: x.icon,
    size: 20
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, x.t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--text-primary)'
    }
  }, x.s)))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHeading, {
    align: "center",
    overline: "New Here?",
    title: "Three easy first steps",
    intro: "We know walking into a new church can feel like a lot. Here's exactly what to expect."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 24,
      marginTop: 48
    }
  }, [{
    n: '01',
    icon: 'hand',
    t: 'Say Hello',
    d: 'Stop by the Welcome Center in the lobby. We saved you a gift.'
  }, {
    n: '02',
    icon: 'users',
    t: 'Find a Seat',
    d: 'Music, a message, and zero pressure. Come as you are.'
  }, {
    n: '03',
    icon: 'heart-handshake',
    t: 'Get Connected',
    d: 'Join a group, serve a team, and meet your people.'
  }].map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 28,
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 'var(--radius-md)',
      background: 'var(--ofc-ink)',
      color: 'var(--ofc-orange-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      color: 'var(--ofc-n-200)'
    }
  }, s.n)), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 8px',
      fontSize: 21
    }
  }, s.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: 'var(--text-secondary)',
      lineHeight: 1.6
    }
  }, s.d))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-sunken)'
    }
  }, /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingTop: 'var(--section-y)',
      paddingBottom: 'var(--section-y)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.15fr 0.85fr',
      gap: 48,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(SermonCard, {
    image: "../../assets/images/cover-message.jpg",
    series: "The Way of Love",
    title: "Love is Patient, Love is Kind",
    speaker: "Pastor Mike Reyes",
    date: "June 8",
    duration: "42 min"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeading, {
    overline: "Current Series",
    title: "Catch the latest message",
    intro: "Missed Sunday? Stream every message on demand, or dig deeper with discussion guides for your group."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => onNavigate('sermons')
  }, "Browse Messages"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "rss",
      size: 16
    })
  }, "Subscribe")))))), /*#__PURE__*/React.createElement(Section, {
    id: "events"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      gap: 16,
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    overline: "What's On",
    title: "Upcoming at One Family"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 16
    })
  }, "Full calendar")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement(EventCard, {
    date: ["12", "JUN"],
    title: "Family Night Cookout",
    time: "6:30 PM",
    location: "The Commons Lawn",
    tag: "All Ages"
  }), /*#__PURE__*/React.createElement(EventCard, {
    date: ["15", "JUN"],
    title: "Baptism Sunday",
    time: "Both Services",
    location: "Main Auditorium",
    tag: "Celebrate"
  }), /*#__PURE__*/React.createElement(EventCard, {
    date: ["21", "JUN"],
    title: "Men's Breakfast",
    time: "8:00 AM",
    location: "Fellowship Hall",
    tag: "Men"
  }))), /*#__PURE__*/React.createElement("div", {
    id: "groups",
    style: {
      background: 'var(--ofc-ink)'
    }
  }, /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(SectionHeading, {
    align: "center",
    overline: "Find Your People",
    title: "A place for every season",
    intro: "From your littlest ones to your living-room crew, there's a way to belong.",
    style: {
      '--text-primary': 'var(--ofc-paper)',
      '--text-secondary': 'rgba(244,251,254,0.78)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 22,
      marginTop: 48
    }
  }, [{
    img: 'cover-kids',
    tag: 'Birth–5th',
    t: 'One Family Kids',
    d: 'Safe, fun, age-specific environments where kids meet Jesus.',
    accent: 'var(--ofc-teal)'
  }, {
    img: 'cover-serve',
    tag: 'Students',
    t: 'Family Youth',
    d: 'Middle & high schoolers building real friendships & faith.',
    accent: 'var(--ofc-orange)'
  }, {
    img: 'cover-worship',
    tag: 'Everyone',
    t: 'Groups & Serve',
    d: 'Do life in a small group and use your gifts on a team.',
    accent: 'var(--ofc-orange-light)'
  }].map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      position: 'relative',
      minHeight: 320,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `../../assets/images/${m.img}.jpg`,
    alt: "",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg, rgba(9,10,13,0.1), rgba(9,10,13,0.82))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: m.accent,
      marginBottom: 8
    }
  }, m.tag), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 6px',
      color: '#fff',
      fontSize: 23
    }
  }, m.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: 'rgba(255,255,255,0.82)',
      fontSize: 14.5,
      lineHeight: 1.55
    }
  }, m.d))))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'linear-gradient(120deg, var(--ofc-orange), var(--ofc-orange-600))',
      borderRadius: 'var(--radius-xl)',
      padding: '56px 48px',
      textAlign: 'center',
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      color: 'var(--ofc-ink)',
      fontSize: 'var(--text-h1)',
      margin: '0 0 12px'
    }
  }, "We'd love to meet you this Sunday."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'rgba(32,36,42,0.78)',
      fontSize: 18,
      maxWidth: 520,
      margin: '0 auto 28px'
    }
  }, "Let us know you're coming and we'll have someone ready to say hello."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    onClick: () => onNavigate('home')
  }, "Plan Your Visit"))));
}
window.HomeView = HomeView;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/HomeView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Icon — thin wrapper over Lucide (CDN). Renders any Lucide icon by name. */
function Icon({
  name,
  size = 20,
  stroke = 2,
  color = 'currentColor',
  style = {},
  ...rest
}) {
  const lib = window.lucide || {};
  // Lucide UMD exposes PascalCase icon nodes; also a `icons` map.
  const toPascal = n => n.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
  const node = lib[toPascal(name)] || lib.icons && lib.icons[name];
  if (!node) return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      display: 'inline-block',
      ...style
    }
  });
  // Lucide UMD node = ["svg", attrs, [ [tag, attrs], ... ]]. Children live at node[2].
  const childList = Array.isArray(node) ? node[2] || [] : node.children || [];
  const children = childList.map(([tag, attrs], i) => React.createElement(tag, {
    key: i,
    ...attrs
  }));
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      flexShrink: 0,
      ...style
    }
  }, rest), children);
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SermonsView.jsx
try { (() => {
/* Sermons view — featured message + filterable library grid. */
function SermonsView({
  onNavigate
}) {
  const {
    Button,
    Badge,
    SectionHeading,
    SermonCard,
    Input
  } = window.DesignSystem_40c311;
  const Icon = window.Icon;
  const series = ['All Messages', 'The Way of Love', 'Rooted', 'Made New', 'Psalms'];
  const [active, setActive] = React.useState(0);
  const all = [{
    series: 'The Way of Love',
    title: 'Love is Patient, Love is Kind',
    speaker: 'Pastor Mike Reyes',
    date: 'Jun 8',
    duration: '42 min',
    img: 'cover-message'
  }, {
    series: 'The Way of Love',
    title: 'Love Keeps No Record',
    speaker: 'Pastor Mike Reyes',
    date: 'Jun 1',
    duration: '38 min',
    img: 'cover-worship'
  }, {
    series: 'Rooted',
    title: 'Deep Roots, Real Fruit',
    speaker: 'Anna Cho',
    date: 'May 25',
    duration: '40 min',
    img: 'cover-community'
  }, {
    series: 'Rooted',
    title: 'Planted by the Water',
    speaker: 'Pastor Mike Reyes',
    date: 'May 18',
    duration: '36 min',
    img: 'cover-pray'
  }, {
    series: 'Made New',
    title: 'Beauty from Ashes',
    speaker: 'David Okafor',
    date: 'May 11',
    duration: '44 min',
    img: 'cover-serve'
  }, {
    series: 'Psalms',
    title: 'A Song in the Valley',
    speaker: 'Anna Cho',
    date: 'May 4',
    duration: '39 min',
    img: 'cover-message'
  }];
  const shown = active === 0 ? all : all.filter(s => s.series === series[active]);
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--ofc-ink)',
      paddingTop: 120,
      paddingBottom: 64
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ofc-orange-light)'
    }
  }, "Messages"), /*#__PURE__*/React.createElement("h1", {
    style: {
      color: 'var(--ofc-paper)',
      fontSize: 'var(--text-h1)',
      margin: '14px 0 0',
      maxWidth: 600
    }
  }, "Catch up on every message, anytime."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      maxWidth: 380
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Search messages, speakers, topics\u2026",
    style: {
      background: 'rgba(255,255,255,0.08)',
      borderColor: 'rgba(255,255,255,0.18)',
      color: '#fff'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 76,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      padding: '14px 0'
    }
  }, series.map((s, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => setActive(i),
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13.5,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
      padding: '9px 18px',
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer',
      border: '1px solid ' + (active === i ? 'transparent' : 'var(--border-default)'),
      background: active === i ? 'var(--ofc-ink)' : 'transparent',
      color: active === i ? 'var(--ofc-paper)' : 'var(--text-secondary)',
      transition: 'all var(--dur-fast)'
    }
  }, s)))), /*#__PURE__*/React.createElement("section", {
    style: {
      paddingTop: 'var(--section-y)',
      paddingBottom: 'var(--section-y)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: 26
    }
  }, shown.map((s, i) => /*#__PURE__*/React.createElement(SermonCard, {
    key: i,
    image: `../../assets/images/${s.img}.jpg`,
    series: s.series,
    title: s.title,
    speaker: s.speaker,
    date: s.date,
    duration: s.duration
  }))), shown.length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "No messages in this series yet."))));
}
window.SermonsView = SermonsView;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SermonsView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteFooter.jsx
try { (() => {
/* Site footer. */
function SiteFooter({
  onNavigate
}) {
  const {
    Button,
    Input
  } = window.DesignSystem_40c311;
  const Icon = window.Icon;
  const cols = [{
    h: 'Visit',
    links: ['Plan a Visit', 'Service Times', 'Location', 'What to Expect']
  }, {
    h: 'Connect',
    links: ['Groups', 'Serve', 'One Family Kids', 'Family Youth']
  }, {
    h: 'Resources',
    links: ['Messages', 'Give', 'Prayer', 'Contact']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--ofc-n-950)',
      color: 'rgba(244,251,254,0.7)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      paddingTop: 64,
      paddingBottom: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/onefamily-horizontal-reversed.svg",
    alt: "One Family Church",
    style: {
      height: 32,
      marginBottom: 18
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14.5,
      lineHeight: 1.6,
      maxWidth: 280,
      margin: '0 0 18px'
    }
  }, "One church, many people. Gathering every Sunday in Austin, TX."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, ['instagram', 'facebook', 'youtube'].map(s => /*#__PURE__*/React.createElement("a", {
    key: s,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(244,251,254,0.8)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s,
    size: 18
  }))))), cols.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--ofc-paper)',
      marginBottom: 14
    }
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, c.links.map((l, j) => /*#__PURE__*/React.createElement("li", {
    key: j
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: 'rgba(244,251,254,0.7)',
      fontSize: 14.5,
      textDecoration: 'none'
    }
  }, l))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,0.1)',
      marginTop: 44,
      paddingTop: 22,
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      fontSize: 13,
      color: 'rgba(244,251,254,0.5)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 One Family Church. All rights reserved."), /*#__PURE__*/React.createElement("span", null, "Privacy \xB7 Terms"))));
}
window.SiteFooter = SiteFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteHeader.jsx
try { (() => {
/* Site header — logo, primary nav, Plan-a-visit CTA. */
function SiteHeader({
  route,
  onNavigate
}) {
  const {
    Button
  } = window.DesignSystem_40c311;
  const Icon = window.Icon;
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const root = document.getElementById('scroll-root') || window;
    const el = document.getElementById('scroll-root');
    const onScroll = () => setScrolled((el ? el.scrollTop : window.scrollY) > 12);
    (el || window).addEventListener('scroll', onScroll);
    return () => (el || window).removeEventListener('scroll', onScroll);
  }, []);
  const links = [{
    key: 'home',
    label: "I'm New"
  }, {
    key: 'sermons',
    label: 'Messages'
  }, {
    key: 'home',
    label: 'Groups',
    anchor: 'groups'
  }, {
    key: 'give',
    label: 'Give'
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: scrolled ? 'rgba(244,251,254,0.88)' : 'transparent',
      backdropFilter: scrolled ? 'saturate(160%) blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--border-subtle)' : '1px solid transparent',
      transition: 'background var(--dur-base), border-color var(--dur-base)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ofc-container",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 76
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('home');
    },
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/onefamily-horizontal.svg",
    alt: "One Family Church",
    style: {
      height: 34
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, links.map((l, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate(l.key);
    },
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: '0.03em',
      color: 'var(--text-secondary)',
      padding: '8px 16px',
      borderRadius: 'var(--radius-sm)',
      textDecoration: 'none',
      transition: 'color var(--dur-fast), background var(--dur-fast)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.color = 'var(--text-brand)';
      e.currentTarget.style.background = 'var(--brand-soft)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = 'var(--text-secondary)';
      e.currentTarget.style.background = 'transparent';
    }
  }, l.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "map-pin",
      size: 15
    }),
    onClick: () => onNavigate('home')
  }, "Plan a Visit")))));
}
window.SiteHeader = SiteHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteHeader.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.EventCard = __ds_scope.EventCard;

__ds_ns.SermonCard = __ds_scope.SermonCard;

})();

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from './supabase.js'

const DEFAULT_CATS = [
  { id: "housing", label: "Housing", icon: "⌂", color: "#E8927C" },
  { id: "food", label: "Food & Groceries", icon: "◉", color: "#7CBEAB" },
  { id: "transport", label: "Transport", icon: "⟐", color: "#C4A6E8" },
  { id: "utilities", label: "Utilities & Bills", icon: "⚡", color: "#E8D06C" },
  { id: "entertainment", label: "Entertainment", icon: "♦", color: "#6CB4E8" },
  { id: "health", label: "Health & Fitness", icon: "✦", color: "#E87CA6" },
  { id: "personal", label: "Personal & Other", icon: "◆", color: "#A6D9E8" },
  { id: "savings", label: "Savings", icon: "◈", color: "#8CE89C", protected: true },
  { id: "investments", label: "Investments", icon: "▲", color: "#FFB86C", protected: true },
];
const ICON_OPTIONS = ["●","◆","★","✦","♦","▲","◉","⬟","⬡","♠","☕","✿","⚙","♫","✈","⊕","◎","⬢","⌘","⊞"];
const COLOR_OPTIONS = ["#E8927C","#7CBEAB","#C4A6E8","#E8D06C","#6CB4E8","#E87CA6","#A6D9E8","#D4A6E8","#E8C46C","#6CE8B4","#E86C8A","#8AA6E8","#C4E86C","#E8A66C","#6CE8E8","#B86CFF"];
const DEF_ALLOC = { housing:30, food:15, transport:10, utilities:8, entertainment:7, health:5, personal:5, savings:10, investments:10 };

// Where the money actually is. `sign` is how it affects net worth.
const ACCOUNT_TYPES = [
  { id:"cash",       label:"Cash",       icon:"◈", color:"#8CE89C", sign: 1 },
  { id:"savings",    label:"Savings",    icon:"⬟", color:"#7CBEAB", sign: 1 },
  { id:"investment", label:"Investment", icon:"▲", color:"#C4A6E8", sign: 1 },
  { id:"debt",       label:"Debt",       icon:"⊘", color:"#E8927C", sign:-1 },
];
const acctType = id => ACCOUNT_TYPES.find(t => t.id === id) || ACCOUNT_TYPES[0];
// Balances go stale. Anything past this many days gets flagged in the UI.
const STALE_DAYS = 30;

const fmt = n => { if(Math.abs(n)>=1e6) return `$${(n/1e6).toFixed(1)}M`; if(Math.abs(n)>=1e3) return `$${(n/1e3).toFixed(1)}K`; return `$${Math.round(n).toLocaleString()}`; };
const fmtFull = n => `$${Math.round(n).toLocaleString()}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const todayStr = () => new Date().toISOString().slice(0,10);
const fmtPct = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
const aggregateMonth = (expenses, monthKey, cats) => {
  const monthExp = expenses.filter(e => e.date && e.date.startsWith(monthKey));
  const byCat = {}; cats.forEach(c => { byCat[c.id] = 0; });
  monthExp.forEach(e => { if (byCat[e.category] !== undefined) byCat[e.category] += (e.amount || 0); });
  const total = monthExp.reduce((a, e) => a + (e.amount || 0), 0);
  return { totalSpent: total, spentByCategory: byCat };
};
const monthLabel = mk => new Date(mk + '-01T00:00:00').toLocaleString('en', { month: 'long', year: 'numeric' });
const snapExpenseBudget = snap => snap.cats.filter(c => !c.protected).reduce((sum, c) => sum + snap.income * (snap.alloc[c.id] || 0) / 100, 0);
const daysSince = iso => { if(!iso) return null; const d = Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime())/864e5); return d < 0 ? 0 : d; };

// Everything is displayed in USD, so ARS balances need the rate. If the rate is
// missing we return null instead of 0 — silently counting an ARS account as
// zero would understate net worth without telling anyone.
const balanceToUsd = (acct, rate) => {
  const bal = acct.balance || 0;
  if (acct.currency !== "ARS") return bal;
  return (rate != null && rate > 0) ? bal / rate : null;
};
const sumAccountsUsd = (accts, rate) => accts.reduce((sum, a) => {
  const usd = balanceToUsd(a, rate);
  return usd == null ? sum : sum + usd;
}, 0);
const computeWealth = (accts = [], rate) => {
  const by = t => accts.filter(a => a.type === t);
  const liquid   = sumAccountsUsd([...by("cash"), ...by("savings")], rate);
  const invested = sumAccountsUsd(by("investment"), rate);
  const debt     = sumAccountsUsd(by("debt"), rate);
  // ARS balances we couldn't convert because the rate isn't set. Surfaced in
  // the UI so the total is never quietly wrong.
  const unconverted = accts.filter(a => balanceToUsd(a, rate) == null).length;
  return { liquid, invested, debt, net: liquid + invested - debt, unconverted };
};

function Slider({ value, onChange, color, max=100 }) {
  const ref = useRef(null); const [drag, setDrag] = useState(false);
  const calc = e => { const r=ref.current.getBoundingClientRect(); const cx=e.touches?e.touches[0].clientX:e.clientX; return Math.round(Math.max(0,Math.min(1,(cx-r.left)/r.width))*max); };
  useEffect(() => { if(!drag) return; const m=e=>{e.preventDefault();onChange(calc(e));}; const u=()=>setDrag(false);
    window.addEventListener("mousemove",m); window.addEventListener("mouseup",u); window.addEventListener("touchmove",m,{passive:false}); window.addEventListener("touchend",u);
    return()=>{window.removeEventListener("mousemove",m);window.removeEventListener("mouseup",u);window.removeEventListener("touchmove",m);window.removeEventListener("touchend",u);};
  },[drag]); const pct=(value/max)*100;
  return (<div ref={ref} style={{position:"relative",height:22,cursor:"pointer",touchAction:"none",display:"flex",alignItems:"center"}}
    onMouseDown={e=>{setDrag(true);onChange(calc(e));}} onTouchStart={e=>{setDrag(true);onChange(calc(e));}}>
    <div style={{position:"absolute",left:0,right:0,height:4,borderRadius:2,background:"var(--track)",overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",borderRadius:2,background:color,transition:drag?"none":"width .15s"}}/></div>
    <div style={{position:"absolute",left:`calc(${pct}% - 8px)`,width:16,height:16,borderRadius:"50%",background:color,boxShadow:`0 0 0 3px var(--bg), 0 0 8px ${color}55`,transition:drag?"none":"left .15s"}}/></div>);
}

function EditableValue({ value, displayValue, onCommit, suffix="", prefix="", color, style={} }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(String(value)); const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.select(); }, [editing]);
  const commit = () => { setEditing(false); const num=parseFloat(draft); if(!isNaN(num)&&num>=0) onCommit(num); else setDraft(String(value)); };
  if (editing) return (<div style={{display:"inline-flex",alignItems:"center",gap:1,...style}}>
    {prefix&&<span style={{fontSize:10,color:"var(--text-dim)"}}>{prefix}</span>}
    <input ref={inputRef} type="number" value={draft} min={0} step="any" onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setDraft(String(value));setEditing(false);}}}
      style={{width:58,textAlign:"right",fontSize:11,padding:"2px 4px",fontFamily:"'Space Mono',monospace",background:"var(--surface2)",border:"1px solid var(--accent)",color:"var(--text)",borderRadius:4}}/>
    {suffix&&<span style={{fontSize:10,color:"var(--text-dim)"}}>{suffix}</span>}</div>);
  const show = displayValue!=null ? displayValue : (typeof value==="number"?Math.round(value):value);
  return (<span onClick={()=>{setDraft(String(value));setEditing(true);}}
    style={{fontFamily:"'Space Mono',monospace",cursor:"pointer",borderBottom:"1px dashed transparent",transition:"border-color .2s",color:color||"var(--text-dim)",...style}}
    onMouseEnter={e=>e.target.style.borderBottomColor=color||"var(--text-dim)"} onMouseLeave={e=>e.target.style.borderBottomColor="transparent"}
    title="Click to edit">{prefix}{show}{suffix}</span>);
}

function Donut({ cats, allocations, income }) {
  const total=Object.values(allocations).reduce((a,b)=>a+b,0); let cum=-90;
  const arcs=cats.map(c=>{const p=(allocations[c.id]||0)/(total||1);const s=cum;const sw=p*360;cum+=sw;return{...c,pct:p,start:s,sweep:sw};}).filter(a=>a.pct>0);
  const r=90,cx=120,cy=120,inner=58;
  const arc=(s,sw,rad)=>{const a=(s*Math.PI)/180,b=((s+sw)*Math.PI)/180;return`M ${cx+rad*Math.cos(a)} ${cy+rad*Math.sin(a)} A ${rad} ${rad} 0 ${sw>180?1:0} 1 ${cx+rad*Math.cos(b)} ${cy+rad*Math.sin(b)}`;};
  return (<svg viewBox="0 0 240 240" style={{width:"100%",maxWidth:200}}>
    {arcs.map(a=><g key={a.id}><path d={arc(a.start+.75,Math.max(a.sweep-1.5,.5),r)} fill="none" stroke={a.color} strokeWidth={32} opacity={.95}/></g>)}
    <circle cx={cx} cy={cy} r={inner} fill="var(--bg)"/>
    <text x={cx} y={cy-8} textAnchor="middle" fill="var(--text-dim)" fontSize="9" fontFamily="'DM Sans',sans-serif" letterSpacing="1.5">MONTHLY</text>
    <text x={cx} y={cy+14} textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="700" fontFamily="'DM Sans',sans-serif">{fmt(income)}</text>
  </svg>);
}

function ProjChart({ income, alloc, months, ret, startSaved=0, startInvested=0 }) {
  const sr=(alloc.savings||0)/100, ir=(alloc.investments||0)/100, mr=ret/100/12;
  const data=[]; let s=startSaved,inv=startInvested;
  for(let i=0;i<=months;i++){if(i>0){s+=income*sr;inv=inv*(1+mr)+income*ir;}data.push({m:i,s,inv,nw:s+inv});}
  const mx=Math.max(...data.map(d=>d.nw),1);
  const W=520,H=170,p={t:10,r:20,b:28,l:55},pw=W-p.l-p.r,ph=H-p.t-p.b;
  const x=i=>p.l+(i/months)*pw, y=v=>p.t+ph-(v/mx)*ph;
  const line=k=>data.map((d,i)=>`${i===0?"M":"L"} ${x(i)} ${y(d[k])}`).join(" ");
  const area=k=>`${line(k)} L ${x(months)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const gv=Array.from({length:5},(_,i)=>(mx/4)*i); const li=Math.max(1,Math.ceil(months/8));
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%"}}>
    {gv.map((v,i)=><g key={i}><line x1={p.l} x2={W-p.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth=".5"/>
      <text x={p.l-8} y={y(v)+3} textAnchor="end" fill="var(--text-dim)" fontSize="8" fontFamily="'DM Sans',sans-serif">{fmt(v)}</text></g>)}
    <defs><linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB86C" stopOpacity=".25"/><stop offset="100%" stopColor="#FFB86C" stopOpacity="0"/></linearGradient>
      <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8CE89C" stopOpacity=".2"/><stop offset="100%" stopColor="#8CE89C" stopOpacity="0"/></linearGradient></defs>
    <path d={area("nw")} fill="url(#gN)"/><path d={area("s")} fill="url(#gS)"/>
    <path d={line("nw")} fill="none" stroke="#FFB86C" strokeWidth="2"/>
    <path d={line("inv")} fill="none" stroke="#C4A6E8" strokeWidth="1.5" strokeDasharray="4 2"/>
    <path d={line("s")} fill="none" stroke="#8CE89C" strokeWidth="1.5"/>
    {data.filter((_,i)=>i%li===0||i===months).map(d=><text key={d.m} x={x(d.m)} y={H-6} textAnchor="middle" fill="var(--text-dim)" fontSize="8" fontFamily="'DM Sans',sans-serif">{d.m===0?"Now":`${d.m}mo`}</text>)}
    <g transform={`translate(${p.l+8},${p.t+6})`}>
      {[{c:"#FFB86C",l:"Net Worth"},{c:"#C4A6E8",l:"Invested",d:true},{c:"#8CE89C",l:"Savings"}].map((l,i)=>
        <g key={i} transform={`translate(${i*90},0)`}><line x1="0" y1="4" x2="14" y2="4" stroke={l.c} strokeWidth="2" strokeDasharray={l.d?"4 2":"none"}/><text x="18" y="7" fill="var(--text-dim)" fontSize="8" fontFamily="'DM Sans',sans-serif">{l.l}</text></g>)}
    </g>
  </svg>);
}

function DualBar({ spent, allocated, color, dayProgress }) {
  const pctSpent = allocated > 0 ? Math.min((spent/allocated)*100, 100) : 0;
  const isOver = spent > allocated && allocated > 0;
  const expectedPct = dayProgress * 100;
  const pace = allocated > 0 ? (pctSpent / (expectedPct || 1)) : 0;
  const paceColor = pace > 1.3 ? "var(--danger)" : pace > 0.9 ? "#E8D06C" : "var(--green)";
  return (
    <div style={{position:"relative",height:10,borderRadius:5,background:"var(--track)",overflow:"visible"}}>
      <div style={{position:"absolute",inset:0,borderRadius:5,background:color,opacity:.15}}/>
      <div style={{position:"absolute",left:0,top:0,bottom:0,borderRadius:5,width:`${Math.min(pctSpent,100)}%`,background:isOver?"var(--danger)":color,opacity:.85,transition:"width .3s"}}/>
      {isOver && <div style={{position:"absolute",right:-2,top:-1,bottom:-1,width:4,borderRadius:2,background:"var(--danger)"}}/>}
      {allocated > 0 && <div style={{position:"absolute",left:`${Math.min(expectedPct,100)}%`,top:-2,bottom:-2,width:2,background:"var(--text-dim)",opacity:.4,borderRadius:1}}/>}
      {allocated > 0 && spent > 0 && (<div style={{position:"absolute",right:4,top:-8,width:6,height:6,borderRadius:3,background:paceColor,boxShadow:`0 0 4px ${paceColor}`}}/>)}
    </div>
  );
}

const Card=({children,style,...p})=><div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"16px 18px",...style}} {...p}>{children}</div>;
const Label=({children,style})=><span style={{fontSize:10,color:"var(--text-dim)",letterSpacing:1.2,textTransform:"uppercase",display:"block",marginBottom:6,...style}}>{children}</span>;
const Btn=({children,active,small,danger,style,...p})=><button style={{padding:small?"5px 12px":"7px 18px",borderRadius:20,border:"none",cursor:"pointer",
  fontFamily:"'DM Sans',sans-serif",fontSize:small?11:13,fontWeight:500,letterSpacing:.3,
  background:active?"var(--accent)":danger?"var(--danger)22":"var(--surface2)",
  color:active?"#111":danger?"var(--danger)":"var(--text-dim)",transition:"all .25s",...style}} {...p}>{children}</button>;
const Progress=({value,max,color})=>{const pct=Math.min(100,(value/(max||1))*100);return<div style={{height:6,borderRadius:3,background:"var(--track)",overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:color,transition:"width .3s"}}/></div>;};

function QuickAddModal({ cats, onAdd, onClose, usdArsRate }) {
  const rateValid = usdArsRate != null && usdArsRate > 0;
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(cats[0]?.id || "food");
  const [desc, setDesc] = useState("");
  const [currency, setCurrency] = useState(rateValid ? "ARS" : "USD");
  const inputRef = useRef(null);
  useEffect(() => { if(inputRef.current) inputRef.current.focus(); }, []);
  useEffect(() => { if (!rateValid && currency === "ARS") setCurrency("USD"); }, [rateValid, currency]);
  const submit = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    if (currency === "ARS" && !rateValid) return;
    const amountUsd = currency === "ARS" ? num / usdArsRate : num;
    onAdd({ id: uid(), date: todayStr(), category, description: desc, amount: amountUsd });
    onClose();
  };
  const currBtn = (code, enabled) => ({
    padding:"6px 14px", borderRadius:16,
    border: currency===code ? "2px solid var(--accent)" : "1px solid var(--border)",
    background: currency===code ? "var(--accent)22" : "transparent",
    color: !enabled ? "var(--text-dim)" : currency===code ? "var(--accent)" : "var(--text-dim)",
    fontSize:11, cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : .5,
    fontFamily:"'DM Sans',sans-serif", transition:"all .15s", fontWeight:600, letterSpacing:.5
  });
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:"22px 20px",maxWidth:400,width:"100%",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <Label style={{marginBottom:0}}>Quick Expense</Label>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <button onClick={()=>setCurrency("USD")} style={currBtn("USD", true)}>USD</button>
          <button
            onClick={()=>{ if(rateValid) setCurrency("ARS"); }}
            disabled={!rateValid}
            title={rateValid ? "" : "Configurá la tasa USD/ARS en el dashboard"}
            style={currBtn("ARS", rateValid)}
          >ARS</button>
          {rateValid && (
            <span style={{alignSelf:"center",fontSize:10,color:"var(--text-dim)",fontFamily:"'Space Mono',monospace",marginLeft:"auto"}}>
              1$ = {usdArsRate} ARS
            </span>
          )}
        </div>
        {!rateValid && (
          <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:10}}>
            Configurá la tasa USD/ARS arriba para cargar en pesos.
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}>
          <span style={{fontFamily:"'Space Mono',monospace",color:"var(--accent)",fontSize:currency==="ARS"?22:28}}>
            {currency==="ARS" ? "$ARS" : "$"}
          </span>
          <input ref={inputRef} type="number" value={amount} min={0} step="any" placeholder="0"
            onChange={e=>setAmount(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}}
            style={{fontSize:28,fontWeight:700,padding:"8px 12px",flex:1}}/>
        </div>
        {currency==="ARS" && rateValid && amount && parseFloat(amount)>0 && (
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:-8,marginBottom:14,fontFamily:"'Space Mono',monospace"}}>
            ≈ ${(parseFloat(amount)/usdArsRate).toFixed(2)} USD
          </div>
        )}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {cats.map(c=>(<button key={c.id} onClick={()=>setCategory(c.id)} style={{
            padding:"6px 12px",borderRadius:16,border:category===c.id?`2px solid ${c.color}`:"1px solid var(--border)",
            background:category===c.id?`${c.color}22`:"transparent",color:category===c.id?c.color:"var(--text-dim)",
            fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .15s",display:"flex",alignItems:"center",gap:4
          }}><span style={{fontSize:10}}>{c.icon}</span>{c.label}</button>))}
        </div>
        <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description (optional)"
          onKeyDown={e=>{if(e.key==="Enter")submit();}} style={{marginBottom:16,fontSize:13}}/>
        <button onClick={submit} disabled={!amount||parseFloat(amount)<=0} style={{
          width:"100%",padding:"12px",borderRadius:10,border:"none",cursor:amount&&parseFloat(amount)>0?"pointer":"not-allowed",
          background:amount&&parseFloat(amount)>0?"var(--accent)":"var(--surface2)",
          color:amount&&parseFloat(amount)>0?"#111":"var(--text-dim)",
          fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,transition:"all .2s"
        }}>Log Expense</button>
      </div>
    </div>
  );
}

function AddCategoryModal({ onAdd, onClose, existingIds }) {
  const [name, setName] = useState(""); const [icon, setIcon] = useState(ICON_OPTIONS[0]); const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const id = name.toLowerCase().replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").slice(0,20) || "custom";
  const idTaken = existingIds.includes(id);
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"24px 22px",maxWidth:380,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <Label style={{marginBottom:0}}>New Category</Label>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{marginBottom:14}}><span style={{fontSize:11,color:"var(--text-dim)",display:"block",marginBottom:4}}>Name</span>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Subscriptions, Rent..." style={{fontSize:14}} autoFocus/>
          {idTaken&&<span style={{fontSize:10,color:"var(--danger)",marginTop:2,display:"block"}}>Already exists</span>}</div>
        <div style={{marginBottom:14}}><span style={{fontSize:11,color:"var(--text-dim)",display:"block",marginBottom:6}}>Icon</span>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{ICON_OPTIONS.map(ic=>(<button key={ic} onClick={()=>setIcon(ic)} style={{
            width:32,height:32,borderRadius:8,border:icon===ic?`2px solid ${color}`:"1px solid var(--border)",
            background:icon===ic?"var(--surface2)":"transparent",color:icon===ic?color:"var(--text-dim)",fontSize:14,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>{ic}</button>))}</div></div>
        <div style={{marginBottom:18}}><span style={{fontSize:11,color:"var(--text-dim)",display:"block",marginBottom:6}}>Color</span>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{COLOR_OPTIONS.map(cl=>(<button key={cl} onClick={()=>setColor(cl)} style={{
            width:26,height:26,borderRadius:13,border:color===cl?"2px solid var(--text)":"2px solid transparent",
            background:cl,cursor:"pointer",transition:"all .15s",boxShadow:color===cl?`0 0 8px ${cl}88`:"none"}}/>))}</div></div>
        {name&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:14}}>
          <span style={{color,fontSize:14}}>{icon}</span><span style={{fontSize:13,fontWeight:500}}>{name}</span></div>}
        <button onClick={()=>{if(!name.trim()||idTaken)return;onAdd({id,label:name.trim(),icon,color,custom:true});}} disabled={!name.trim()||idTaken} style={{
          width:"100%",padding:"10px",borderRadius:10,border:"none",cursor:name.trim()&&!idTaken?"pointer":"not-allowed",
          background:name.trim()&&!idTaken?"var(--accent)":"var(--surface2)",color:name.trim()&&!idTaken?"#111":"var(--text-dim)",
          fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,transition:"all .2s"}}>Add Category</button>
      </div>
    </div>
  );
}

export default function FinancePlanner({ session }) {
  const [loaded, setLoaded] = useState(false);
  const [income, setIncome] = useState(5000);
  const [cats, setCats] = useState([...DEFAULT_CATS]);
  const [alloc, setAlloc] = useState({...DEF_ALLOC});
  const [projMo, setProjMo] = useState(24);
  const [investRet, setInvestRet] = useState(8);
  const [tab, setTab] = useState("month");
  const [goals, setGoals] = useState([]);
  const [debts, setDebts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [usdArsRate, setUsdArsRate] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [monthlySnapshots, setMonthlySnapshots] = useState({});
  const [lastSeenMonthKey, setLastSeenMonthKey] = useState(null);
  const [openMonth, setOpenMonth] = useState(null);
  const skipNextSave = useRef(true);
  const saveTimer = useRef(null);

  const expenseCats = useMemo(() => cats.filter(c => !c.protected), [cats]);

  // Load from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('finance_data').select('data').eq('user_id', session.user.id).maybeSingle();
        if (error) throw error;
        if (data?.data) {
          const d = data.data;
          if (d.income!=null) setIncome(d.income);
          if (d.cats) setCats(d.cats);
          if (d.alloc) setAlloc(d.alloc);
          if (d.projMo) setProjMo(d.projMo);
          if (d.investRet!=null) setInvestRet(d.investRet);
          if (d.goals) setGoals(d.goals);
          if (d.debts) setDebts(d.debts);
          if (d.expenses) setExpenses(d.expenses);
          if (d.scenarios) setScenarios(d.scenarios);
          if (d.accounts) setAccounts(d.accounts);
          if (d.usdArsRate != null) setUsdArsRate(d.usdArsRate);

          const now = new Date();
          const currentMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
          const prevSnaps = d.monthlySnapshots || {};
          const prevSeen = d.lastSeenMonthKey;
          if (!prevSeen) {
            setMonthlySnapshots(prevSnaps);
            setLastSeenMonthKey(currentMK);
          } else if (prevSeen !== currentMK && !prevSnaps[prevSeen]) {
            const snapCats = d.cats || [...DEFAULT_CATS];
            const snapAlloc = d.alloc || {...DEF_ALLOC};
            const snapIncome = d.income != null ? d.income : 5000;
            const { totalSpent, spentByCategory } = aggregateMonth(d.expenses || [], prevSeen, snapCats);
            setMonthlySnapshots({
              ...prevSnaps,
              [prevSeen]: {
                income: snapIncome,
                alloc: JSON.parse(JSON.stringify(snapAlloc)),
                cats: JSON.parse(JSON.stringify(snapCats)),
                totalSpent, spentByCategory,
                // Balances as last confirmed — this is what builds the real
                // net-worth curve over time.
                wealth: computeWealth(d.accounts, d.usdArsRate),
                snapshotAt: new Date().toISOString(),
              }
            });
            setLastSeenMonthKey(currentMK);
          } else {
            setMonthlySnapshots(prevSnaps);
            setLastSeenMonthKey(prevSeen === currentMK ? prevSeen : currentMK);
          }

          setSaveMsg("✓ Restored"); setTimeout(()=>setSaveMsg(""),2500);
        } else {
          const now = new Date();
          setLastSeenMonthKey(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
        }
      } catch(e) { console.error("Load error:", e); setSaveMsg("⚠ Load failed"); setTimeout(()=>setSaveMsg(""),3000); }
      skipNextSave.current = true; setLoaded(true);
    })();
  }, [session.user.id]);

  // Auto-save to Supabase
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const payload = { income, cats, alloc, projMo, investRet, goals, debts, expenses, scenarios, accounts, usdArsRate, monthlySnapshots, lastSeenMonthKey };
        const { error } = await supabase.from('finance_data').upsert({
          user_id: session.user.id, data: payload, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
        setSaveMsg("✓ Saved"); setTimeout(()=>setSaveMsg(""),2000);
      } catch(e) { console.error("Save error:", e); setSaveMsg("⚠ Save failed"); setTimeout(()=>setSaveMsg(""),3000); }
    }, 1000);
  }, [income, cats, alloc, projMo, investRet, goals, debts, expenses, scenarios, accounts, usdArsRate, monthlySnapshots, lastSeenMonthKey, loaded, session.user.id]);

  // Recompute snapshot aggregates when expenses change (e.g. user edits a past expense)
  useEffect(() => {
    if (!loaded) return;
    const keys = Object.keys(monthlySnapshots);
    if (keys.length === 0) return;
    let changed = false;
    const next = {...monthlySnapshots};
    for (const mk of keys) {
      const snap = monthlySnapshots[mk];
      const { totalSpent, spentByCategory } = aggregateMonth(expenses, mk, snap.cats);
      if (snap.totalSpent !== totalSpent || JSON.stringify(snap.spentByCategory) !== JSON.stringify(spentByCategory)) {
        next[mk] = { ...snap, totalSpent, spentByCategory };
        changed = true;
      }
    }
    if (changed) setMonthlySnapshots(next);
  }, [expenses, monthlySnapshots, loaded]);

  const totalPct = useMemo(() => parseFloat(Object.values(alloc).reduce((a,b)=>a+b,0).toFixed(2)), [alloc]);
  const isOver = totalPct > 100;

  // --- Net worth, from the accounts the user actually holds ---
  const wealth = useMemo(() => computeWealth(accounts, usdArsRate), [accounts, usdArsRate]);

  // Projection now compounds forward from what you already have instead of
  // restarting at zero every time.
  const forecast = useCallback((al, mo, startSaved = 0, startInvested = 0) => {
    const sr=(al.savings||0)/100, ir=(al.investments||0)/100, mr=investRet/100/12;
    let s=startSaved,inv=startInvested; for(let i=0;i<mo;i++){s+=income*sr;inv=inv*(1+mr)+income*ir;}
    return {saved:s,invested:inv,gains:inv-startInvested-income*ir*mo,nw:s+inv};
  }, [income, investRet]);
  const summary = useMemo(
    () => forecast(alloc, projMo, wealth.liquid, wealth.invested),
    [forecast, alloc, projMo, wealth.liquid, wealth.invested]
  );

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const dayOfMonth = now.getDate();
  const dayProgress = dayOfMonth / daysInMonth;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthName = now.toLocaleString('en',{month:'long', year:'numeric'});

  const monthExpenses = useMemo(() => expenses.filter(e=>e.date&&e.date.startsWith(monthKey)), [expenses, monthKey]);
  const spentByCategory = useMemo(() => {
    const m={}; cats.forEach(c=>m[c.id]=0);
    monthExpenses.forEach(e=>{if(m[e.category]!==undefined)m[e.category]+=(e.amount||0);});
    return m;
  }, [monthExpenses, cats]);
  const totalSpent = useMemo(() => monthExpenses.reduce((a,e)=>a+(e.amount||0),0), [monthExpenses]);
  const totalAllocated = income * totalPct / 100;
  const expenseBudget = useMemo(() => {
    let sum = 0; expenseCats.forEach(c => sum += income*(alloc[c.id]||0)/100);
    return sum;
  }, [income, alloc, expenseCats]);

  const debtTimeline = useMemo(() => debts.map(d => {
    if(!d.balance||!d.minPayment) return {...d,months:0,totalPaid:0,totalInterest:0};
    let bal=d.balance,paid=0,mo=0; const mr=(d.rate||0)/100/12,pmt=d.minPayment+(d.extraPayment||0);
    while(bal>0.01&&mo<600){const int=bal*mr;const pay=Math.min(bal+int,pmt);bal=bal+int-pay;paid+=pay;mo++;}
    return {...d,months:mo,totalPaid:paid,totalInterest:paid-d.balance};
  }), [debts]);

  const addCategory = (cat) => {
    setCats(prev => { const pi=prev.findIndex(c=>c.protected); return [...prev.slice(0,pi),cat,...prev.slice(pi)]; });
    setAlloc(prev => ({...prev, [cat.id]: 0})); setShowAddCat(false);
  };
  const removeCategory = (catId) => { setCats(p=>p.filter(c=>c.id!==catId)); setAlloc(p=>{const n={...p};delete n[catId];return n;}); };
  const addExpense = (exp) => setExpenses(prev => [exp, ...prev]);

  const addAccount = () => setAccounts(prev => [...prev, {
    id: uid(), name: "", type: "savings", currency: "USD", balance: 0,
    color: COLOR_OPTIONS[prev.length % COLOR_OPTIONS.length], updatedAt: todayStr()
  }]);
  // Touching the balance re-dates the account; renaming or recoloring doesn't,
  // so the "last updated" badge keeps meaning "when I last confirmed this number".
  const updateAccount = (id, patch) => setAccounts(prev => prev.map(a =>
    a.id === id ? { ...a, ...patch, ...("balance" in patch ? { updatedAt: todayStr() } : {}) } : a
  ));
  // Unlink any goal pointing here, freezing the last known balance as its manual
  // value — otherwise the goal would silently drop to a stale number with no
  // indication that its funding source is gone.
  const removeAccount = (id) => {
    const acct = accounts.find(a => a.id === id);
    const lastUsd = acct ? (balanceToUsd(acct, usdArsRate) ?? 0) : 0;
    setAccounts(prev => prev.filter(a => a.id !== id));
    setGoals(prev => prev.map(g => g.accountId === id ? { ...g, accountId: null, saved: lastUsd } : g));
  };

  const projectedMonthSpend = useMemo(() => {
    if (dayOfMonth <= 1) return totalSpent;
    return (totalSpent / dayOfMonth) * daysInMonth;
  }, [totalSpent, dayOfMonth, daysInMonth]);

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  if (!loaded) return (<div style={{padding:60,textAlign:"center",color:"var(--text-dim)",fontFamily:"'DM Sans',sans-serif"}}>
    <style>{`:root{--bg:#111117;--text-dim:#7a7a8e;} body{background:var(--bg);}`}</style>
    <div style={{fontSize:13,opacity:.7}}>Loading your data from the cloud...</div></div>);

  const tabs = [
    {id:"month",label:"This Month",emoji:"◉"},
    {id:"wealth",label:"Net Worth",emoji:"◈"},
    {id:"allocate",label:"Allocate",emoji:"⊞"},
    {id:"projection",label:"Projection",emoji:"◸"},
    {id:"goals",label:"Goals",emoji:"◎"},
    {id:"debts",label:"Debts",emoji:"⊘"},
    {id:"history",label:"History",emoji:"≡"},
    {id:"months",label:"Months",emoji:"⊡"},
    {id:"scenarios",label:"Scenarios",emoji:"⊟"},
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=Space+Mono:wght@400;700&display=swap');
        :root{--bg:#111117;--surface:#1a1a23;--surface2:#22222e;--border:#2a2a38;--text:#e8e8ef;--text-dim:#7a7a8e;--accent:#FFB86C;--track:#2a2a38;--danger:#E8927C;--green:#8CE89C;}
        *{margin:0;padding:0;box-sizing:border-box;} body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;}
        input[type=number],input[type=text],input[type=date],select{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-family:'Space Mono',monospace;font-size:13px;width:100%;outline:none;transition:border .2s;}
        input:focus,select:focus{border-color:var(--accent);} select{appearance:auto;}
        input[type=number]::-webkit-inner-spin-button{opacity:1;} ::selection{background:#FFB86C33;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}} .fu{animation:fadeUp .35s ease both;}
        ::-webkit-scrollbar{width:5px;height:5px;} ::-webkit-scrollbar-track{background:var(--bg);} ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
      `}</style>
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 16px 80px"}}>
        <div className="fu" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:2}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase"}}>Finance</span>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"var(--text-dim)",letterSpacing:2}}>Planner</span>
            </div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-.5,lineHeight:1.2}}>Your Money, <span style={{color:"var(--accent)"}}>Your Rules</span></h1>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{fontSize:10,fontFamily:"'Space Mono',monospace",whiteSpace:"nowrap",
              color:saveMsg.includes("✓")?"var(--green)":saveMsg.includes("⚠")?"var(--danger)":"var(--text-dim)",
              opacity:saveMsg?1:.5}}>{saveMsg||"cloud sync"}</span>
            <button onClick={handleSignOut} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:10,fontFamily:"'DM Sans',sans-serif",opacity:.6}}>sign out</button>
          </div>
        </div>

        <Card className="fu" style={{marginBottom:12,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",padding:"12px 18px"}}>
          <div style={{flex:"1 1 180px"}}><Label>Monthly Income</Label>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontFamily:"'Space Mono',monospace",color:"var(--accent)",fontSize:18}}>$</span>
              <input type="number" value={income} min={0} step={100} onChange={e=>setIncome(Math.max(0,+e.target.value))} style={{fontSize:18,fontWeight:700,padding:"6px 10px"}}/></div></div>
          <div><Label>Horizon</Label><div style={{display:"flex",alignItems:"center",gap:4}}><input type="number" value={projMo} min={1} max={360} onChange={e=>setProjMo(Math.max(1,Math.min(360,+e.target.value)))} style={{width:58,textAlign:"center"}}/><span style={{fontSize:10,color:"var(--text-dim)"}}>mo</span></div></div>
          <div><Label>Return %/yr</Label><input type="number" value={investRet} min={0} max={30} step={.5} onChange={e=>setInvestRet(Math.max(0,Math.min(30,+e.target.value)))} style={{width:58,textAlign:"center"}}/></div>
          <div><Label>USD/ARS Rate</Label>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontFamily:"'Space Mono',monospace",color:"var(--text-dim)",fontSize:11}}>1$ =</span>
              <input type="number" value={usdArsRate ?? ""} min={0} step="any" placeholder="—"
                onChange={e=>{const v=e.target.value;setUsdArsRate(v===""?null:Math.max(0,+v));}}
                style={{width:78,textAlign:"center"}}/>
              <span style={{fontSize:10,color:"var(--text-dim)"}}>ARS</span>
            </div></div>
        </Card>

        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",overflowX:"auto"}}>
          {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"6px 12px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:500,
            background:tab===t.id?"var(--accent)":"var(--surface2)",color:tab===t.id?"#111":"var(--text-dim)",
            transition:"all .25s",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",flexShrink:0}}>
            <span style={{fontSize:10,opacity:.7}}>{t.emoji}</span>{t.label}</button>))}
        </div>

        {tab==="month" && (
          <div className="fu">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:"Income",value:fmtFull(income),color:"var(--text)"},
                {label:"Allocated",value:fmtFull(totalAllocated),sub:`${fmtPct(totalPct)}%`,color:"var(--accent)"},
                {label:"Spent",value:fmtFull(totalSpent),sub:`day ${dayOfMonth}/${daysInMonth}`,color:totalSpent>expenseBudget?"var(--danger)":"var(--green)"},
                {label:"Remaining",value:fmtFull(Math.max(0,expenseBudget-totalSpent)),sub:totalSpent>expenseBudget?"over budget":`of ${fmtFull(expenseBudget)} budget`,color:totalSpent>expenseBudget?"var(--danger)":"var(--text)"},
              ].map(c=>(<Card key={c.label} style={{padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:4}}>{c.label}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:17,fontWeight:700,color:c.color}}>{c.value}</div>
                {c.sub && <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{c.sub}</div>}
              </Card>))}
            </div>
            <Card style={{padding:"12px 16px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Label style={{marginBottom:0}}>Month Progress — Day {dayOfMonth} of {daysInMonth}</Label>
                <span style={{fontSize:10,fontFamily:"'Space Mono',monospace",color:"var(--text-dim)"}}>{Math.round(dayProgress*100)}%</span>
              </div>
              <div style={{height:4,borderRadius:2,background:"var(--track)",overflow:"hidden"}}>
                <div style={{width:`${dayProgress*100}%`,height:"100%",borderRadius:2,background:"var(--accent)",opacity:.6}}/>
              </div>
              {totalSpent > 0 && (<div style={{marginTop:8,fontSize:11,color:"var(--text-dim)",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                <span>At this pace, you'll spend <span style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:projectedMonthSpend>expenseBudget?"var(--danger)":"var(--green)"}}>{fmtFull(Math.round(projectedMonthSpend))}</span> this month</span>
                <span>{projectedMonthSpend>expenseBudget ? <span style={{color:"var(--danger)"}}>~{fmtFull(Math.round(projectedMonthSpend-expenseBudget))} over budget</span>
                  : <span style={{color:"var(--green)"}}>~{fmtFull(Math.round(expenseBudget-projectedMonthSpend))} under budget</span>}</span>
              </div>)}
            </Card>
            <Card style={{marginBottom:16}}>
              <Label>Budget vs Actual</Label>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {expenseCats.map(c => {
                  const allocated = income*(alloc[c.id]||0)/100;
                  const spent = spentByCategory[c.id]||0;
                  const isOver = spent > allocated && allocated > 0;
                  return (<div key={c.id}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:c.color,fontSize:11}}>{c.icon}</span>{c.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:isOver?"var(--danger)":c.color,fontWeight:700}}>{fmtFull(spent)}</span>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"var(--text-dim)",opacity:.5}}>/ {fmtFull(allocated)}</span>
                      </div>
                    </div>
                    <DualBar spent={spent} allocated={allocated} color={c.color} dayProgress={dayProgress}/>
                  </div>);
                })}
              </div>
            </Card>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <Label style={{marginBottom:0}}>Recent Expenses</Label>
                <Btn small onClick={()=>setShowQuickAdd(true)}>+ Add</Btn>
              </div>
              {monthExpenses.length===0 && <p style={{fontSize:12,color:"var(--text-dim)",padding:"16px 0",textAlign:"center"}}>No expenses this month. Tap + to log one.</p>}
              {monthExpenses.slice(0,8).map((ex,i)=>{
                const cat = cats.find(c=>c.id===ex.category);
                return (<div key={ex.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<Math.min(monthExpenses.length,8)-1?"1px solid var(--border)":"none"}}>
                  <span style={{color:cat?.color||"var(--text-dim)",fontSize:12,width:16,textAlign:"center"}}>{cat?.icon||"●"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.description||cat?.label||"Expense"}</div>
                    <div style={{fontSize:10,color:"var(--text-dim)"}}>{ex.date}</div>
                  </div>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color:cat?.color||"var(--text)"}}>${ex.amount}</span>
                  <button onClick={()=>setExpenses(es=>es.filter(e=>e.id!==ex.id))} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:12,opacity:.3,padding:"0 2px"}}>×</button>
                </div>);
              })}
            </Card>
          </div>
        )}

        {tab==="wealth" && (
          <div className="fu">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:"Net Worth",value:fmtFull(wealth.net),color:"var(--accent)"},
                {label:"Liquid",value:fmtFull(wealth.liquid),color:"var(--green)"},
                {label:"Invested",value:fmtFull(wealth.invested),color:"#C4A6E8"},
                {label:"Debt",value:fmtFull(wealth.debt),color:wealth.debt>0?"var(--danger)":"var(--text-dim)"},
              ].map(c=>(<Card key={c.label} style={{padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:4}}>{c.label}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:17,fontWeight:700,color:c.color}}>{c.value}</div>
              </Card>))}
            </div>

            {wealth.unconverted > 0 && (
              <Card style={{marginBottom:12,padding:"10px 14px",borderColor:"var(--danger)"}}>
                <span style={{fontSize:11,color:"var(--danger)"}}>
                  {wealth.unconverted} {wealth.unconverted===1?"cuenta en ARS queda":"cuentas en ARS quedan"} fuera del total: falta configurar la tasa USD/ARS arriba.
                </span>
              </Card>
            )}

            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <Label style={{marginBottom:0}}>Accounts</Label>
                <Btn small onClick={addAccount}>+ Add Account</Btn>
              </div>

              {accounts.length===0 && (
                <p style={{fontSize:12,color:"var(--text-dim)",padding:"24px 0",textAlign:"center",lineHeight:1.6}}>
                  Todavía no cargaste dónde está tu plata.<br/>
                  Agregá una cuenta por cada lugar donde tenés ahorros —<br/>
                  colchón, plazo fijo, CEDEARs, fondo del viaje.
                </p>
              )}

              {ACCOUNT_TYPES.map(t => {
                const list = accounts.filter(a => a.type === t.id);
                if (list.length === 0) return null;
                const subtotal = sumAccountsUsd(list, usdArsRate);
                return (
                  <div key={t.id} style={{marginBottom:18}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:5,borderBottom:"1px solid var(--border)"}}>
                      <span style={{fontSize:11,color:t.color,display:"flex",alignItems:"center",gap:6,letterSpacing:1,textTransform:"uppercase"}}>
                        <span>{t.icon}</span>{t.label}
                      </span>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color:t.color}}>
                        {t.sign<0?"−":""}{fmtFull(subtotal)}
                      </span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {list.map(a => {
                        const usd = balanceToUsd(a, usdArsRate);
                        const days = daysSince(a.updatedAt);
                        const stale = days != null && days > STALE_DAYS;
                        return (
                          <div key={a.id} style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px"}}>
                            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                              <input type="text" placeholder="Nombre (ej. Plazo fijo Santander)" value={a.name}
                                onChange={e=>updateAccount(a.id,{name:e.target.value})} style={{flex:1,fontSize:13}}/>
                              <button onClick={()=>{if(confirm(`Borrar "${a.name||"esta cuenta"}"?`))removeAccount(a.id);}}
                                style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:16}}>×</button>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(104px,1fr))",gap:8}}>
                              <div>
                                <span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Type</span>
                                <select value={a.type} onChange={e=>updateAccount(a.id,{type:e.target.value})} style={{fontSize:11}}>
                                  {ACCOUNT_TYPES.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Currency</span>
                                <select value={a.currency} onChange={e=>updateAccount(a.id,{currency:e.target.value})} style={{fontSize:11}}>
                                  <option value="USD">USD</option><option value="ARS">ARS</option>
                                </select>
                              </div>
                              <div>
                                <span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>
                                  {t.sign<0?"Owed":"Balance"}
                                </span>
                                <input type="number" value={a.balance} min={0} step="any"
                                  onChange={e=>updateAccount(a.id,{balance:Math.max(0,+e.target.value)})} style={{textAlign:"right"}}/>
                              </div>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,flexWrap:"wrap",gap:6}}>
                              <span style={{fontFamily:"'Space Mono',monospace",color:"var(--text-dim)"}}>
                                {a.currency==="ARS"
                                  ? (usd==null ? <span style={{color:"var(--danger)"}}>sin tasa — no suma al total</span> : `≈ ${fmtFull(usd)} USD`)
                                  : `${fmtFull(a.balance||0)} USD`}
                              </span>
                              {days!=null && (
                                <span style={{color:stale?"var(--danger)":"var(--text-dim)",opacity:stale?1:.6}}>
                                  {days===0?"actualizado hoy":`actualizado hace ${days}d`}{stale?" ⚠":""}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {tab==="allocate" && (
          <div className="fu" style={{display:"flex",gap:14,flexWrap:"wrap"}}>
            <Card style={{flex:"1 1 340px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <Label>Allocation — {cats.length} categories</Label>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color:isOver?"var(--danger)":totalPct===100?"var(--green)":"var(--accent)"}}>
                  {fmtPct(totalPct)}%{isOver?" ⚠ over":totalPct<100?` — ${fmtPct(100-totalPct)}% free`:" ✓"}</span>
              </div>
              {cats.map(c=>(<div key={c.id} style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <span style={{fontSize:12.5,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:c.color,fontSize:11}}>{c.icon}</span>{c.label}
                    {c.custom&&<button onClick={()=>{if(confirm(`Remove "${c.label}"?`))removeCategory(c.id);}} style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:12,opacity:.4,padding:"0 2px"}}>×</button>}
                  </span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <EditableValue value={alloc[c.id]||0} displayValue={fmtPct(alloc[c.id]||0)}
                      onCommit={v=>setAlloc(p=>({...p,[c.id]:Math.min(100,Math.max(0,parseFloat(v.toFixed(2))))}))}
                      suffix="%" color="var(--text-dim)" style={{fontSize:11,minWidth:28,textAlign:"right"}}/>
                    <EditableValue value={Math.round(income*(alloc[c.id]||0)/100)}
                      onCommit={v=>{const pct=income>0?Math.min(100,parseFloat(((v/income)*100).toFixed(2))):0;setAlloc(p=>({...p,[c.id]:pct}));}}
                      prefix="$" color="var(--text-dim)" style={{fontSize:10,minWidth:50,textAlign:"right",opacity:.6}}/>
                  </div>
                </div>
                <Slider value={alloc[c.id]||0} onChange={v=>setAlloc(p=>({...p,[c.id]:v}))} color={c.color}/>
              </div>))}
              <button onClick={()=>setShowAddCat(true)} style={{width:"100%",padding:"10px",borderRadius:8,border:"1px dashed var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,marginTop:6,transition:"all .2s"}}>+ Add Custom Category</button>
            </Card>
            <div style={{flex:"0 0 210px",display:"flex",flexDirection:"column",gap:12}}>
              <Card style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"14px 12px"}}>
                <Donut cats={cats} allocations={alloc} income={income}/></Card>
              <Card>
                <Label>{projMo}mo Forecast</Label>
                {[{l:"Savings",v:summary.saved,c:"#8CE89C"},{l:"Invested",v:summary.invested,c:"#C4A6E8"},{l:"Gains",v:summary.gains,c:"#FFB86C"}].map(i=>
                  <div key={i.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:11,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:i.c,display:"inline-block"}}/>{i.l}</span>
                    <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,color:i.c}}>{fmt(i.v)}</span></div>)}
                <div style={{display:"flex",justifyContent:"space-between",paddingTop:8}}>
                  <span style={{fontSize:12,fontWeight:700}}>Net Worth</span>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"var(--accent)"}}>{fmt(summary.nw)}</span></div>
              </Card>
            </div>
          </div>
        )}

        {tab==="projection" && (<Card className="fu">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <Label>Wealth Projection — {projMo} months</Label>
            <span style={{fontSize:11,color:"var(--text-dim)"}}>Net Worth: <span style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:"var(--accent)"}}>{fmt(summary.nw)}</span></span></div>
          <ProjChart income={income} alloc={alloc} months={projMo} ret={investRet} startSaved={wealth.liquid} startInvested={wealth.invested}/>
          <div style={{marginTop:16,overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'Space Mono',monospace"}}>
              <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
                {["Month","Savings","Invested","Gains","Net Worth"].map(h=><th key={h} style={{padding:"5px 10px",textAlign:"right",color:"var(--text-dim)",fontWeight:500,fontSize:10,textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>{[3,6,12,24,36,48,60,84,120,180,240,360].filter(m=>m<=projMo).map(m=>{const f=forecast(alloc,m,wealth.liquid,wealth.invested);
                return <tr key={m} style={{borderBottom:"1px solid var(--border)"}}>
                  <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-dim)"}}>{m}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",color:"#8CE89C"}}>{fmt(f.saved)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",color:"#C4A6E8"}}>{fmt(f.invested)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",color:"#FFB86C"}}>{fmt(f.gains)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700}}>{fmt(f.nw)}</td></tr>;})}</tbody>
            </table></div>
        </Card>)}

        {tab==="goals" && (<div className="fu"><Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <Label>Financial Goals</Label>
            <Btn small onClick={()=>setGoals(g=>[...g,{id:uid(),name:"",target:1000,saved:0,color:cats[goals.length%cats.length].color}])}>+ Add Goal</Btn></div>
          {goals.length===0&&<p style={{fontSize:13,color:"var(--text-dim)",padding:"24px 0",textAlign:"center"}}>No goals yet.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {goals.map((g,i)=>{
              // A goal linked to an account reads its progress from that
              // account's balance; unlinked goals keep the manual number.
              const linked = g.accountId ? accounts.find(a=>a.id===g.accountId) : null;
              const saved = linked ? (balanceToUsd(linked, usdArsRate) ?? 0) : (g.saved||0);
              const pct=Math.min(100,(saved/(g.target||1))*100);
              const mSave=income*((alloc.savings||0)+(alloc.investments||0))/100;
              const rem=Math.max(0,g.target-saved); const mtg=mSave>0?Math.ceil(rem/mSave):Infinity;
              return (<div key={g.id} style={{background:"var(--surface2)",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                  <input type="text" placeholder="Goal name" value={g.name} onChange={e=>setGoals(gs=>gs.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:"1 1 140px",fontSize:13}}/>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:10,color:"var(--text-dim)"}}>Target $</span>
                    <input type="number" value={g.target} min={0} onChange={e=>setGoals(gs=>gs.map((x,j)=>j===i?{...x,target:+e.target.value}:x))} style={{width:90,textAlign:"right"}}/></div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:10,color:"var(--text-dim)"}}>Saved $</span>
                    {linked
                      ? <span title="Viene de la cuenta linkeada" style={{width:90,textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:13,color:g.color,fontWeight:700}}>{fmtFull(saved)}</span>
                      : <input type="number" value={g.saved} min={0} onChange={e=>setGoals(gs=>gs.map((x,j)=>j===i?{...x,saved:+e.target.value}:x))} style={{width:90,textAlign:"right"}}/>}</div>
                  <button onClick={()=>setGoals(gs=>gs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:16}}>×</button></div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap"}}>Funded by</span>
                  <select value={g.accountId||""} onChange={e=>setGoals(gs=>gs.map((x,j)=>j===i?{...x,accountId:e.target.value||null}:x))} style={{fontSize:11,flex:"1 1 auto"}}>
                    <option value="">— manual —</option>
                    {accounts.map(a=><option key={a.id} value={a.id}>{a.name||"(sin nombre)"} · {acctType(a.type).label}</option>)}
                  </select>
                </div>
                <Progress value={saved} max={g.target} color={g.color}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,flexWrap:"wrap",gap:4}}>
                  <span style={{color:g.color,fontFamily:"'Space Mono',monospace",fontWeight:700}}>{pct.toFixed(0)}%</span>
                  <span style={{color:"var(--text-dim)"}}>{rem>0?`${fmtFull(rem)} to go`:"🎉 Goal reached!"}{rem>0&&mtg<Infinity&&<span style={{marginLeft:8,color:"var(--accent)"}}>~{mtg} mo</span>}</span></div>
              </div>);})}</div>
        </Card></div>)}

        {tab==="debts" && (<div className="fu"><Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <Label>Debt Payoff</Label>
            <Btn small onClick={()=>setDebts(d=>[...d,{id:uid(),name:"",balance:0,rate:0,minPayment:0,extraPayment:0}])}>+ Add Debt</Btn></div>
          {debts.length===0&&<p style={{fontSize:13,color:"var(--text-dim)",padding:"24px 0",textAlign:"center"}}>No debts tracked.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {debtTimeline.map((d,i)=>{const upd=(k,v)=>setDebts(ds=>ds.map((x,j)=>j===i?{...x,[k]:v}:x));
              return (<div key={d.id} style={{background:"var(--surface2)",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                  <input type="text" placeholder="Debt name" value={d.name} onChange={e=>upd("name",e.target.value)} style={{flex:"1 1 130px",fontSize:13}}/>
                  <button onClick={()=>setDebts(ds=>ds.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:16}}>×</button></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:10}}>
                  <div><span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Balance</span><input type="number" value={d.balance} min={0} onChange={e=>upd("balance",+e.target.value)}/></div>
                  <div><span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Rate %/yr</span><input type="number" value={d.rate} min={0} step={.1} onChange={e=>upd("rate",+e.target.value)}/></div>
                  <div><span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Min Pay</span><input type="number" value={d.minPayment} min={0} onChange={e=>upd("minPayment",+e.target.value)}/></div>
                  <div><span style={{fontSize:9,color:"var(--text-dim)",textTransform:"uppercase"}}>Extra</span><input type="number" value={d.extraPayment||0} min={0} onChange={e=>upd("extraPayment",+e.target.value)}/></div></div>
                {d.balance>0&&d.minPayment>0&&(<div style={{display:"flex",gap:14,fontSize:11,flexWrap:"wrap"}}>
                  <span style={{color:"var(--text-dim)"}}>Payoff: <span style={{color:"var(--accent)",fontFamily:"'Space Mono',monospace",fontWeight:700}}>{d.months<600?`${d.months} mo`:"∞"}</span></span>
                  <span style={{color:"var(--text-dim)"}}>Interest: <span style={{color:"var(--danger)",fontFamily:"'Space Mono',monospace",fontWeight:700}}>{fmt(d.totalInterest)}</span></span></div>)}
              </div>);})}</div>
        </Card></div>)}

        {tab==="history" && (<div className="fu"><Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <Label>Expense History — {monthName}</Label>
            <Btn small onClick={()=>setShowQuickAdd(true)}>+ Log</Btn></div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {expenses.length===0&&<p style={{fontSize:12,color:"var(--text-dim)",padding:"20px 0",textAlign:"center"}}>No expenses logged.</p>}
            {expenses.slice(0,80).map((ex,i)=>(
              <div key={ex.id} style={{display:"flex",gap:6,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                <input type="date" value={ex.date} onChange={e=>setExpenses(es=>es.map((x,j)=>j===i?{...x,date:e.target.value}:x))} style={{width:110,fontSize:10}}/>
                <select value={ex.category} onChange={e=>setExpenses(es=>es.map((x,j)=>j===i?{...x,category:e.target.value}:x))} style={{width:100,fontSize:10}}>
                  {expenseCats.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
                <input type="text" placeholder="Desc" value={ex.description} onChange={e=>setExpenses(es=>es.map((x,j)=>j===i?{...x,description:e.target.value}:x))} style={{flex:1,fontSize:10,minWidth:60}}/>
                <input type="number" value={ex.amount} min={0} onChange={e=>setExpenses(es=>es.map((x,j)=>j===i?{...x,amount:+e.target.value}:x))} style={{width:72,textAlign:"right",fontSize:10}}/>
                <button onClick={()=>setExpenses(es=>es.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:13}}>×</button></div>))}
          </div>
        </Card></div>)}

        {tab==="months" && (<div className="fu">
          <Card>
            <Label>Past Months</Label>
            {Object.keys(monthlySnapshots).length===0 && (
              <p style={{fontSize:12,color:"var(--text-dim)",padding:"24px 0",textAlign:"center",lineHeight:1.5}}>
                Los snapshots se crean automáticamente cuando termina el mes.<br/>
                Tu historial empieza el mes que viene.
              </p>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {Object.keys(monthlySnapshots).sort().reverse().map(mk => {
                const snap = monthlySnapshots[mk];
                const budget = snapExpenseBudget(snap);
                const isOpen = openMonth === mk;
                const monthExp = expenses.filter(e=>e.date&&e.date.startsWith(mk)).sort((a,b)=>b.date.localeCompare(a.date));
                const overBudget = snap.totalSpent > budget && budget > 0;
                return (
                  <div key={mk} style={{background:"var(--surface2)",borderRadius:10,overflow:"hidden"}}>
                    <button onClick={()=>setOpenMonth(isOpen?null:mk)} style={{
                      width:"100%",padding:"12px 14px",background:"transparent",border:"none",cursor:"pointer",
                      display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,color:"var(--text)",
                      fontFamily:"'DM Sans',sans-serif"
                    }}>
                      <span style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"var(--text-dim)",transform:isOpen?"rotate(90deg)":"none",transition:"transform .2s"}}>▸</span>
                        <span style={{fontSize:13,fontWeight:500}}>{monthLabel(mk)}</span>
                      </span>
                      <span style={{display:"flex",gap:10,alignItems:"baseline"}}>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color:overBudget?"var(--danger)":"var(--green)"}}>{fmtFull(snap.totalSpent)}</span>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"var(--text-dim)",opacity:.6}}>/ {fmtFull(budget)}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{padding:"4px 16px 16px"}}>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:14}}>
                          {[
                            {label:"Income",value:fmtFull(snap.income),color:"var(--text)"},
                            {label:"Budget",value:fmtFull(budget),color:"var(--accent)"},
                            {label:"Spent",value:fmtFull(snap.totalSpent),color:overBudget?"var(--danger)":"var(--green)"},
                            {label:overBudget?"Over":"Saved",value:fmtFull(Math.abs(budget-snap.totalSpent)),color:overBudget?"var(--danger)":"var(--green)"},
                            // Only on snapshots taken after accounts existed.
                            ...(snap.wealth ? [{label:"Net Worth",value:fmtFull(snap.wealth.net),color:"#C4A6E8"}] : []),
                          ].map(c=>(
                            <div key={c.label} style={{background:"var(--surface)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                              <div style={{fontSize:9,color:"var(--text-dim)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:3}}>{c.label}</div>
                              <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:c.color}}>{c.value}</div>
                            </div>
                          ))}
                        </div>
                        <Label>Budget vs Actual</Label>
                        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
                          {snap.cats.filter(c=>!c.protected).map(c => {
                            const allocated = snap.income*(snap.alloc[c.id]||0)/100;
                            const spent = snap.spentByCategory[c.id]||0;
                            const over = spent > allocated && allocated > 0;
                            return (<div key={c.id}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                <span style={{fontSize:11,display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{color:c.color,fontSize:10}}>{c.icon}</span>{c.label}
                                </span>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:over?"var(--danger)":c.color,fontWeight:700}}>{fmtFull(spent)}</span>
                                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"var(--text-dim)",opacity:.5}}>/ {fmtFull(allocated)}</span>
                                </div>
                              </div>
                              <DualBar spent={spent} allocated={allocated} color={c.color} dayProgress={1}/>
                            </div>);
                          })}
                        </div>
                        {monthExp.length > 0 && (
                          <>
                            <Label>Expenses ({monthExp.length})</Label>
                            <div style={{display:"flex",flexDirection:"column"}}>
                              {monthExp.map((ex,i)=>{
                                const cat = snap.cats.find(c=>c.id===ex.category) || cats.find(c=>c.id===ex.category);
                                return (<div key={ex.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<monthExp.length-1?"1px solid var(--border)":"none"}}>
                                  <span style={{color:cat?.color||"var(--text-dim)",fontSize:11,width:14,textAlign:"center"}}>{cat?.icon||"●"}</span>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.description||cat?.label||"Expense"}</div>
                                    <div style={{fontSize:9,color:"var(--text-dim)"}}>{ex.date}</div>
                                  </div>
                                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,color:cat?.color||"var(--text)"}}>${Math.round(ex.amount)}</span>
                                </div>);
                              })}
                            </div>
                          </>
                        )}
                        <div style={{marginTop:12,fontSize:9,color:"var(--text-dim)",opacity:.6,fontFamily:"'Space Mono',monospace"}}>
                          snapshot · {new Date(snap.snapshotAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>)}

        {tab==="scenarios" && (<div className="fu"><Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <Label>Scenarios</Label>
            <Btn small onClick={()=>setScenarios(s=>[...s,{id:uid(),name:`Scenario ${s.length+1}`,alloc:{...alloc}}])}>+ Save Current</Btn></div>
          {scenarios.length===0&&<p style={{fontSize:13,color:"var(--text-dim)",padding:"24px 0",textAlign:"center"}}>Save your current allocation to compare.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {scenarios.map((sc,i)=>{const f=forecast(sc.alloc,projMo,wealth.liquid,wealth.invested);const cmp=compareIds.includes(sc.id);
              return (<div key={sc.id} style={{background:cmp?"#FFB86C0D":"var(--surface2)",borderRadius:10,padding:"12px 14px",border:cmp?"1px solid #FFB86C44":"1px solid transparent"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6,flexWrap:"wrap"}}>
                  <input type="text" value={sc.name} onChange={e=>setScenarios(ss=>ss.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:"1 1 120px",fontSize:13,fontWeight:700,background:"transparent",border:"none",color:"var(--text)"}}/>
                  <div style={{display:"flex",gap:5}}>
                    <Btn small active={cmp} onClick={()=>setCompareIds(ids=>ids.includes(sc.id)?ids.filter(x=>x!==sc.id):[...ids,sc.id])} style={{fontSize:10}}>{cmp?"Comparing":"Compare"}</Btn>
                    <Btn small onClick={()=>setAlloc({...sc.alloc})} style={{fontSize:10}}>Load</Btn>
                    <button onClick={()=>setScenarios(ss=>ss.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14}}>×</button></div></div>
                <div style={{display:"flex",gap:14,fontSize:11,flexWrap:"wrap"}}>
                  <span style={{color:"var(--text-dim)"}}>Net Worth: <span style={{color:"var(--accent)",fontFamily:"'Space Mono',monospace",fontWeight:700}}>{fmt(f.nw)}</span></span></div>
              </div>);})}</div>
        </Card></div>)}
      </div>

      <button onClick={()=>setShowQuickAdd(true)} style={{
        position:"fixed",bottom:24,right:24,width:52,height:52,borderRadius:26,border:"none",
        background:"var(--accent)",color:"#111",fontSize:24,fontWeight:700,cursor:"pointer",
        boxShadow:"0 4px 20px #FFB86C44, 0 2px 8px #0006",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100
      }}>+</button>

      {showQuickAdd && <QuickAddModal cats={expenseCats} onAdd={addExpense} onClose={()=>setShowQuickAdd(false)} usdArsRate={usdArsRate}/>}
      {showAddCat && <AddCategoryModal onAdd={addCategory} onClose={()=>setShowAddCat(false)} existingIds={cats.map(c=>c.id)}/>}
    </>
  );
}

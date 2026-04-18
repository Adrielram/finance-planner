import { useState } from 'react'
import { supabase } from './supabase.js'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      const { error } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (error) setMsg(error.message)
      else if (mode === 'signup') setMsg('Check your email to confirm your account')
    } catch (err) {
      setMsg(err.message)
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=Space+Mono:wght@400;700&display=swap');
        :root{--bg:#111117;--surface:#1a1a23;--surface2:#22222e;--border:#2a2a38;--text:#e8e8ef;--text-dim:#7a7a8e;--accent:#FFB86C;--danger:#E8927C;}
        *{margin:0;padding:0;box-sizing:border-box;} body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;}
        input{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border .2s;}
        input:focus{border-color:var(--accent);}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"32px 28px",maxWidth:380,width:"100%"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:6}}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase"}}>Finance</span>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"var(--text-dim)",letterSpacing:2}}>Planner</span>
          </div>
          <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-.5,marginBottom:24}}>Your Money, <span style={{color:"var(--accent)"}}>Your Rules</span></h1>

          <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:12}}>
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus />
            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} />
            <button type="submit" disabled={loading} style={{
              padding:"12px",borderRadius:10,border:"none",cursor:loading?"wait":"pointer",
              background:"var(--accent)",color:"#111",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,marginTop:4,
              opacity:loading?.6:1
            }}>
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          {msg && <p style={{marginTop:12,fontSize:12,color:msg.includes('Check')?"#8CE89C":"var(--danger)",textAlign:"center"}}>{msg}</p>}

          <button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMsg('');}}
            style={{background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:12,marginTop:16,width:"100%",fontFamily:"'DM Sans',sans-serif"}}>
            {mode === 'signin' ? "Don't have an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </>
  )
}

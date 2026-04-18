import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import FinancePlanner from './FinancePlanner.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#111117",display:"flex",alignItems:"center",justifyContent:"center",color:"#7a7a8e",fontFamily:"sans-serif"}}>
      Loading...
    </div>
  )

  if (!session) return <Auth />

  return <FinancePlanner session={session} />
}

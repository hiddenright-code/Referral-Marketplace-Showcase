'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function PitchSheet({ company, onClose }) {
  const [pitch, setPitch] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [gift, setGift] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [companyId, setCompanyId] = useState(null)
  const [insiders, setInsiders] = useState([])
  const [selectedInsider, setSelectedInsider] = useState(null)

  useEffect(() => {
    async function loadInsiders() {
      if (!company) return

      // Get company id
      const { data: co } = await supabase
        .from('companies')
        .select('id')
        .eq('name', company)
        .single()

      if (!co) return
      setCompanyId(co.id)

      // Get insiders at this company
      const { data: insiderProfiles } = await supabase
        .from('insider_profiles')
        .select(`
          *,
          user:user_id (
            id,
            full_name,
            tag_line,
            avatar_url
          )
        `)
        .eq('company', company)
        .eq('open_to_referring', true)

      setInsiders(insiderProfiles || [])
    }
    loadInsiders()
  }, [company])

  async function handleSend() {
    if (!pitch.trim()) {
      setError('Please write your pitch first.')
      return
    }
    if (!selectedInsider) {
      setError('Please select an insider to pitch to.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const seekerId = session.user.id


      // Load seeker's badges to determine weekly pitch limit
      const { data: seekerBadges } = await supabase
        .from('badges')
        .select('badge_type')
        .eq('user_id', seekerId)

      const hasPortfolioLinked = seekerBadges?.some(b => b.badge_type === 'portfolio_linked')
      const hasCommunityVerified = seekerBadges?.some(b => b.badge_type === 'community_verified')
      const weeklyLimit = hasPortfolioLinked ? 6 : hasCommunityVerified ? 4 : 3

      // Rate limit — rolling 7 day window
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { count: recentPitchCount } = await supabase
        .from('pitches')
        .select('*', { count: 'exact', head: true })
        .eq('seeker_id', seekerId)
        .gte('created_at', sevenDaysAgo.toISOString())

      if (recentPitchCount >= weeklyLimit) {
        const { data: oldestPitch } = await supabase
          .from('pitches')
          .select('created_at')
          .eq('seeker_id', seekerId)
          .gte('created_at', sevenDaysAgo.toISOString())
          .order('created_at', { ascending: true })
          .limit(1)
          .single()

        const resetDate = new Date(oldestPitch.created_at)
        resetDate.setDate(resetDate.getDate() + 7)
        const resetStr = resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        setError(`You've reached your weekly pitch limit of ${weeklyLimit}. Your limit resets on ${resetStr}.`)
        setLoading(false)
        return
      }

      // Company cooldown — max 2 pitches per company per 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { count: companyPitchCount } = await supabase
        .from('pitches')
        .select('*', { count: 'exact', head: true })
        .eq('seeker_id', seekerId)
        .eq('company_id', companyId)
        .gte('created_at', thirtyDaysAgo.toISOString())

      if (companyPitchCount >= 2) {
        const { data: latestCompanyPitch } = await supabase
          .from('pitches')
          .select('created_at')
          .eq('seeker_id', seekerId)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const cooldownEnd = new Date(latestCompanyPitch.created_at)
        cooldownEnd.setDate(cooldownEnd.getDate() + 30)
        const cooldownStr = cooldownEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        setError(`You've pitched 2 insiders at ${company} recently. You can pitch again here after ${cooldownStr}.`)
        setLoading(false)
        return
      }

      // Check if pitch already exists to same insider
      const { data: existing } = await supabase
        .from('pitches')
        .select('id')
        .eq('seeker_id', seekerId)
        .eq('insider_id', selectedInsider.user_id)
        .eq('company_id', companyId)
        .single()

      if (existing) {
        setError('You have already pitched this insider. Please wait for their response.')
        setLoading(false)
        return
      }

      // Create the pitch
      const { error: pitchError } = await supabase
        .from('pitches')
        .insert({
          seeker_id: seekerId,
          insider_id: selectedInsider.user_id,
          company_id: companyId,
          pitch_text: pitch,
          portfolio_link: portfolio || null,
          success_gift: gift || null,
          status: 'pending',
        })

      if (pitchError) throw pitchError

      // Create in-app notification for insider
      await supabase
        .from('notifications')
        .insert({
          user_id: selectedInsider.user_id,
          type: 'pitch_received',
          message: `A seeker has pitched you for a referral at ${company}. Review their pitch in your feed.`,
          related_id: companyId,
        })

      onClose()
      alert('Pitch sent! The insider will be notified.')
    } catch (err) {
      setError(err.message || 'Error sending pitch. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!company) return null

  const inputStyle = {
    width: '100%', borderRadius: '8px',
    border: '0.5px solid rgba(0,0,0,0.2)',
    padding: '10px 12px',
    fontFamily: 'DM Sans, sans-serif', fontSize: '13px',
    color: '#111', resize: 'none', outline: 'none', background: '#fff',
    marginBottom: '14px',
  }

  const labelStyle = {
    fontSize: '12px', fontWeight: '500', color: '#555',
    marginBottom: '6px', letterSpacing: '0.04em', display: 'block',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 100,
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: '420px',
        background: '#fff', borderRadius: '16px 16px 0 0',
        padding: '20px 20px 32px',
        zIndex: 101, maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#D3D1C7', margin: '0 auto 16px' }} />

        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', fontWeight: '500', marginBottom: '4px', color: '#111' }}>
          Pitch to an insider at {company}
        </div>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '18px' }}>
          Be concise — insiders spend ~30 seconds on each pitch.
        </div>

        {error && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A32D2D', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {/* Select insider */}
        <label style={labelStyle}>SELECT AN INSIDER</label>
        {insiders.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '14px', background: '#f9f8f5', borderRadius: '8px', padding: '12px' }}>
            No insiders available at {company} right now. Check back soon!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {insiders.map(insider => {
              const isSelected = selectedInsider?.user_id === insider.user_id
              const initials = insider.user?.full_name
                ? insider.user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : '??'
              return (
                <div
                  key={insider.user_id}
                  onClick={() => setSelectedInsider(insider)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px', borderRadius: '10px', cursor: 'pointer',
                    background: isSelected ? '#E1F5EE' : '#f9f8f5',
                    border: `0.5px solid ${isSelected ? '#085041' : 'rgba(0,0,0,0.08)'}`,
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: '#E1F5EE', color: '#085041',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '500', fontSize: '13px', flexShrink: 0, overflow: 'hidden',
                  }}>
                    {insider.user?.avatar_url ? (
                      <img src={insider.user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : insider.anonymity_on ? '🔒' : initials}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>
                      {insider.anonymity_on ? `${insider.role_level} @ ${company}` : insider.user?.full_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {insider.anonymity_on ? 'Identity revealed after match' : insider.department}
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ marginLeft: 'auto', color: '#085041', fontSize: '16px' }}>✓</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <label style={labelStyle}>WHY SHOULD I VOUCH FOR YOU?</label>
        <textarea
          value={pitch}
          onChange={e => setPitch(e.target.value)}
          placeholder="e.g. 5 years backend infra, shipped payment systems at scale..."
          rows={3}
          style={inputStyle}
        />

        <label style={labelStyle}>PORTFOLIO / GITHUB / LINKEDIN</label>
        <input
          value={portfolio}
          onChange={e => setPortfolio(e.target.value)}
          type="text"
          placeholder="https://"
          style={inputStyle}
        />

        <label style={labelStyle}>SUCCESS GIFT (OPTIONAL)</label>
        <input
          value={gift}
          onChange={e => setGift(e.target.value)}
          type="text"
          placeholder="e.g. $100 to Islamic Relief if hired"
          style={inputStyle}
        />

        <button
          onClick={handleSend}
          disabled={loading || insiders.length === 0}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px',
            background: loading || insiders.length === 0 ? '#888' : '#085041',
            color: '#E1F5EE', border: 'none',
            fontFamily: 'DM Sans, sans-serif', fontSize: '13px',
            fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '8px',
          }}
        >
          {loading ? 'Sending...' : 'Send pitch →'}
        </button>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px',
            background: 'transparent', color: '#888',
            border: '0.5px solid rgba(0,0,0,0.12)',
            fontFamily: 'DM Sans, sans-serif', fontSize: '13px', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </>
  )
}
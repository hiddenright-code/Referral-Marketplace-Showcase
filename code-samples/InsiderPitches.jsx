'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Card from './ui/Card'
import Badge from './ui/Badge'

export default function InsiderPitches({ onPitchResolved }) {
  const [pitches, setPitches] = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)
  const [declineReasons, setDeclineReasons] = useState([])
  const [declineComment, setDeclineComment] = useState('')
  const [showDeclineForm, setShowDeclineForm] = useState(null)

  const DECLINE_REASONS = [
    "Your background doesn't match the role I can refer for",
    "We're not currently hiring in your area",
    "Your profile needs more detail before I can vouch for you",
    "I've already referred someone for a similar role",
    "Your target role is outside my department or team",
    "I don't feel confident enough to vouch yet — please connect with me first",
    "Other",
  ]

  useEffect(() => {
   async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('pitches_detailed')
        .select('*')
        .eq('insider_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading pitches:', error)
        setLoading(false)
        return
      }

      const mapped = (data || []).map(p => ({
        id: p.id,
        seeker_id: p.seeker_id,
        insider_id: p.insider_id,
        company_id: p.company_id,
        pitch_text: p.pitch_text,
        portfolio_link: p.portfolio_link,
        success_gift: p.success_gift,
        status: p.status,
        decline_reasons: p.decline_reasons,
        decline_comment: p.decline_comment,
        created_at: p.created_at,
        seeker: {
          id: p.seeker_id,
          full_name: p.seeker_full_name,
          tag_line: p.seeker_tag_line,
          avatar_url: p.seeker_avatar_url,
          linkedin_url: p.seeker_linkedin_url,
        },
        seeker_profile: {
          summary: p.seeker_summary,
          current_location: p.seeker_location,
          visa_status: p.seeker_visa,
          work_preference: p.seeker_work_pref,
          seeking_status: p.seeker_status,
        },
        company: {
          id: p.company_id,
          name: p.company_name,
        },
      }))

      setPitches(mapped)
      setLoading(false)
    }
    load()
  }, [])

  async function handleAccept(pitch) {
    setResponding(pitch.id)
    try {
      const { error } = await supabase
        .from('pitches')
        .update({ status: 'accepted' })
        .eq('id', pitch.id)

      if (error) throw error

      setPitches(prev => prev.filter(p => p.id !== pitch.id))
      onPitchResolved?.()

      // Send email notification to seeker
      fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pitch_accepted',
          recipientId: pitch.seeker_id,
          data: { companyName: pitch.company?.name },
        }),
      })

      alert(`Match made! A chat has opened with ${pitch.seeker?.full_name}.`)
    } catch (err) {
      alert('Error accepting pitch. Please try again.')
    } finally {
      setResponding(null)
    }
  }

  async function handleDecline(pitch) {
    if (declineReasons.length === 0) {
      alert('Please select at least one reason for declining.')
      return
    }

    setResponding(pitch.id)
    try {
      const { error } = await supabase
        .from('pitches')
        .update({
          status: 'declined',
          decline_reasons: declineReasons,
          decline_comment: declineComment || null,
        })
        .eq('id', pitch.id)

      if (error) throw error

      setPitches(prev => prev.filter(p => p.id !== pitch.id))
      setShowDeclineForm(null)
      setDeclineReasons([])
      setDeclineComment('')
      onPitchResolved?.()

      // In-app notification for seeker
      await supabase.from('notifications').insert({
        user_id: pitch.seeker_id,
        type: 'pitch_declined',
        message: `Your pitch to ${pitch.company?.name} was not accepted. Check your matches page for the reason.`,
        read: false,
        related_id: pitch.id,
      })

      // Send email notification to seeker
      fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pitch_declined',
          recipientId: pitch.seeker_id,
          data: {
            companyName: pitch.company?.name,
            reasons: declineReasons,
            comment: declineComment || null,
          },
        }),
      })

      alert('Pitch declined. The seeker has been notified with your reason.')
    } catch (err) {
      alert('Error declining pitch. Please try again.')
    } finally {
      setResponding(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontFamily: 'DM Sans, sans-serif' }}>
        Loading pitches...
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '14px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '17px', fontWeight: '500', color: '#111' }}>
          Incoming pitches
        </div>
        <div style={{ fontSize: '12px', color: '#888' }}>{pitches.length} pending</div>
      </div>

      {pitches.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
          No pending pitches. Check back soon!
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pitches.map(pitch => {
            const seeker = pitch.seeker
            const seekerProfile = pitch.seeker_profile
            const initials = seeker?.full_name
              ? seeker.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
              : '??'
            const isShowingDecline = showDeclineForm === pitch.id

            return (
              <div key={pitch.id} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Seeker header */}
                <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: '#E1F5EE', color: '#085041',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: '500', fontSize: '13px', flexShrink: 0, overflow: 'hidden',
                    }}>
                      {seeker?.avatar_url ? (
                        <img src={seeker.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '14px', color: '#111' }}>{seeker?.full_name}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{seeker?.tag_line}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#085041', fontWeight: '500', background: '#E1F5EE', padding: '3px 8px', borderRadius: '20px' }}>
                      {pitch.company?.name}
                    </div>
                  </div>

                  {/* Seeker details */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {seekerProfile?.current_location && (
                      <span style={{ fontSize: '11px', background: '#f9f8f5', color: '#888', padding: '3px 8px', borderRadius: '20px' }}>
                        📍 {seekerProfile.current_location}
                      </span>
                    )}
                    {seekerProfile?.work_preference && (
                      <span style={{ fontSize: '11px', background: '#f9f8f5', color: '#888', padding: '3px 8px', borderRadius: '20px' }}>
                        {seekerProfile.work_preference}
                      </span>
                    )}
                    {seekerProfile?.visa_status && (
                      <span style={{ fontSize: '11px', background: '#f9f8f5', color: '#888', padding: '3px 8px', borderRadius: '20px' }}>
                        {seekerProfile.visa_status.includes('Not required') ? '✓ No visa needed' : '⚠ Visa required'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pitch content */}
                <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#888', letterSpacing: '0.06em', marginBottom: '8px' }}>THEIR PITCH</div>
                  <div style={{ fontSize: '13px', color: '#111', lineHeight: '1.6', background: '#E1F5EE', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                    {pitch.pitch_text}
                  </div>
                  {pitch.portfolio_link && (
                    <a href={pitch.portfolio_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#085041', display: 'block', marginBottom: '6px' }}>
                      🔗 {pitch.portfolio_link}
                    </a>
                  )}
                  {pitch.success_gift && (
                    <div style={{ fontSize: '12px', color: '#633806', background: '#FAEEDA', padding: '6px 10px', borderRadius: '6px' }}>
                      🎁 Success gift: {pitch.success_gift}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ padding: '14px 16px' }}>
                  {!isShowingDecline ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleAccept(pitch)}
                        disabled={responding === pitch.id}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '8px',
                          background: '#085041', color: '#E1F5EE', border: 'none',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '13px',
                          fontWeight: '500', cursor: 'pointer',
                        }}
                      >
                        {responding === pitch.id ? 'Accepting...' : 'Accept →'}
                      </button>
                      <button
                        onClick={() => setShowDeclineForm(pitch.id)}
                        style={{
                          padding: '10px 16px', borderRadius: '8px',
                          background: 'transparent', color: '#888',
                          border: '0.5px solid rgba(0,0,0,0.12)',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '13px', cursor: 'pointer',
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '500', color: '#888', letterSpacing: '0.06em', marginBottom: '10px' }}>
                        REASON FOR DECLINING
                      </div>
                      {DECLINE_REASONS.map(reason => {
                        const isSelected = declineReasons.includes(reason)
                        return (
                          <div
                            key={reason}
                            onClick={() => setDeclineReasons(prev =>
                              prev.includes(reason)
                                ? prev.filter(r => r !== reason)
                                : [...prev, reason]
                            )}
                            style={{
                              padding: '9px 12px', borderRadius: '8px', fontSize: '13px',
                              cursor: 'pointer', marginBottom: '6px',
                              background: isSelected ? '#FCEBEB' : '#f9f8f5',
                              color: isSelected ? '#A32D2D' : '#111',
                              border: `0.5px solid ${isSelected ? '#F09595' : 'rgba(0,0,0,0.08)'}`,
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                          >
                            <span style={{
                              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                              border: `2px solid ${isSelected ? '#F09595' : '#ccc'}`,
                              background: isSelected ? '#FCEBEB' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isSelected && <span style={{ fontSize: '10px', color: '#A32D2D', fontWeight: '500' }}>✓</span>}
                            </span>
                            {reason}
                          </div>
                        )
                      })}
                      <textarea
                        value={declineComment}
                        onChange={e => setDeclineComment(e.target.value)}
                        placeholder="Additional comments (optional)..."
                        rows={2}
                        style={{
                          width: '100%', borderRadius: '8px',
                          border: '0.5px solid rgba(0,0,0,0.15)',
                          padding: '10px 12px', marginTop: '8px', marginBottom: '12px',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '13px',
                          color: '#111', resize: 'none', outline: 'none', background: '#fff',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleDecline(pitch)}
                          disabled={responding === pitch.id || declineReasons.length === 0}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '8px',
                            background: declineReasons.length > 0 ? '#A32D2D' : '#D3D1C7',
                            color: '#fff', border: 'none',
                            fontFamily: 'DM Sans, sans-serif', fontSize: '13px',
                            fontWeight: '500', cursor: declineReasons.length > 0 ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {responding === pitch.id ? 'Declining...' : 'Confirm decline'}
                        </button>
                        <button
                          onClick={() => { setShowDeclineForm(null); setDeclineReasons([]); setDeclineComment('') }}
                          style={{
                            padding: '10px 16px', borderRadius: '8px',
                            background: 'transparent', color: '#888',
                            border: '0.5px solid rgba(0,0,0,0.12)',
                            fontFamily: 'DM Sans, sans-serif', fontSize: '13px', cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ height: '16px' }} />
    </div>
  )
}
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

// Server-side Supabase client using service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const FROM_EMAIL = 'MRN <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(request) {
  try {
    const body = await request.json()
    const { type, recipientId, data } = body

    if (!type || !recipientId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get recipient user info
    const { data: recipient } = await supabase
      .from('users')
      .select('email:id, full_name')
      .eq('id', recipientId)
      .single()

    // Get recipient email from auth
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(recipientId)
    if (!authUser?.email) {
      return Response.json({ error: 'Recipient not found' }, { status: 404 })
    }

    const recipientEmail = authUser.email
    const recipientName = recipient?.full_name || 'there'

    // Get notification preferences
    const { data: prefs } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', recipientId)
      .single()

    // Map event type to preference key
    const prefKey = {
      pitch_accepted: 'pitch_accepted',
      pitch_declined: 'pitch_declined',
      pipeline_hired: 'pipeline_updates',
    }[type]

    // Check if user wants email for this event
    const prefValue = prefs?.[prefKey]
    const shouldEmail = prefValue === 'both' || prefValue === 'email'

    // If no preference set, use defaults
    const defaults = {
      pitch_accepted: 'both',
      pitch_declined: 'both',
      pipeline_hired: 'both',
    }
    const effectivePref = prefValue || defaults[type]
    const willEmail = effectivePref === 'both' || effectivePref === 'email'

    if (!willEmail) {
      return Response.json({ skipped: true, reason: 'User preference is inapp or off' })
    }

    // Build email content based on type
    let subject = ''
    let html = ''

    const baseStyle = `
      font-family: 'DM Sans', Arial, sans-serif;
      max-width: 520px;
      margin: 0 auto;
      background: #f5f4f0;
      padding: 24px 16px;
    `
    const cardStyle = `
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 0.5px solid rgba(0,0,0,0.1);
    `
    const headerStyle = `
      background: #085041;
      padding: 24px 28px;
    `
    const bodyStyle = `
      padding: 24px 28px;
    `
    const btnStyle = `
      display: inline-block;
      background: #085041;
      color: #E1F5EE;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      margin-top: 20px;
    `

    if (type === 'pitch_accepted') {
      subject = '🎉 Your pitch was accepted!'
      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">Your pitch was accepted! 🎉</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Great news — an insider at <strong>${data.companyName}</strong> has accepted your pitch. A private chat has been opened for you both.
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                Head over to your Matches page to start the conversation and get your referral moving.
              </p>
              <a href="${APP_URL}" style="${btnStyle}">Open MRN →</a>
              <p style="font-size: 12px; color: #aaa; margin-top: 24px; line-height: 1.6;">
                You're receiving this because you have email notifications enabled for pitch updates. 
                You can change this in <a href="${APP_URL}" style="color: #085041;">Settings → Notifications</a>.
              </p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'pitch_declined') {
      subject = 'An update on your pitch'
      const reasonsList = data.reasons?.length
        ? data.reasons.map(r => `<li style="margin-bottom: 6px;">${r}</li>`).join('')
        : '<li>No specific reason provided</li>'

      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">Update on your pitch to ${data.companyName}</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                The insider at <strong>${data.companyName}</strong> has decided not to move forward with your referral at this time.
              </p>
              <div style="background: #f9f8f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 500; color: #888; letter-spacing: 0.06em; margin-bottom: 10px;">REASON(S)</div>
                <ul style="font-size: 14px; color: #555; line-height: 1.7; margin: 0; padding-left: 20px;">
                  ${reasonsList}
                </ul>
                ${data.comment ? `<p style="font-size: 13px; color: #888; font-style: italic; margin: 12px 0 0;">"${data.comment}"</p>` : ''}
              </div>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                Don't be discouraged — there are other insiders at MRN who may be a great fit. Use this feedback to strengthen your profile and try again.
              </p>
              <a href="${APP_URL}" style="${btnStyle}">Browse other insiders →</a>
              <p style="font-size: 12px; color: #aaa; margin-top: 24px; line-height: 1.6;">
                You can change notification preferences in <a href="${APP_URL}" style="color: #085041;">Settings → Notifications</a>.
              </p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'pipeline_hired') {
      subject = '🏆 Your referral got hired!'
      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">Mabrook! Your referral got hired 🏆</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                <strong>${data.seekerName}</strong> has marked themselves as hired at <strong>${data.companyName}</strong>. Your referral made a real difference — Barakah Points have been added to your account.
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                May Allah bless you for your support of the community. 🌿
              </p>
              <a href="${APP_URL}" style="${btnStyle}">View your Barakah Points →</a>
              <p style="font-size: 12px; color: #aaa; margin-top: 24px; line-height: 1.6;">
                You can change notification preferences in <a href="${APP_URL}" style="color: #085041;">Settings → Notifications</a>.
              </p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'pipeline_reminder_7d') {
      subject = '⏰ Referral reminder — 1 week'
      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">Still waiting on that referral 👋</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                It's been a week since you matched with <strong>${data.seekerName}</strong> for a referral at <strong>${data.companyName}</strong>. They're counting on you — can you submit the referral today?
              </p>
              <a href="${APP_URL}" style="${btnStyle}">Open MRN →</a>
              <p style="font-size: 12px; color: #aaa; margin-top: 24px; line-height: 1.6;">
                You can change notification preferences in <a href="${APP_URL}" style="color: #085041;">Settings → Notifications</a>.
              </p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'pipeline_reminder_14d') {
      subject = '⚠️ Final nudge — referral still pending'
      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">Final nudge on your referral</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                <strong>${data.seekerName}</strong> has been waiting 2 weeks for their referral to <strong>${data.companyName}</strong>.
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                If you're able to submit please do so now. If you're no longer able to refer them, please let them know through the chat so they can explore other options.
              </p>
              <a href="${APP_URL}" style="${btnStyle}">Open MRN →</a>
              <p style="font-size: 12px; color: #aaa; margin-top: 24px; line-height: 1.6;">
                You can change notification preferences in <a href="${APP_URL}" style="color: #085041;">Settings → Notifications</a>.
              </p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'pipeline_stale') {
      subject = 'A referral match has gone stale'
      html = `
        <div style="${baseStyle}">
          <div style="${cardStyle}">
            <div style="${headerStyle}">
              <div style="font-size: 22px; font-weight: 600; color: #E1F5EE; letter-spacing: -0.02em;">MRN</div>
              <div style="font-size: 11px; color: #9FE1CB; letter-spacing: 0.06em; margin-top: 2px;">THE INSIDER NETWORK · FOR THE UMMAH</div>
            </div>
            <div style="${bodyStyle}">
              <h2 style="font-size: 20px; color: #111; margin: 0 0 12px;">This match has been marked stale</h2>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Assalamu alaikum ${recipientName},
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 12px;">
                Your match with <strong>${data.seekerName}</strong> at <strong>${data.companyName}</strong> has been marked stale after 18 days with no referral submitted.
              </p>
              <p style="font-size: 14px; color: #555; line-height: 1.7; margin: 0 0 20px;">
                The seeker has been notified and may explore other insiders. If you still wish to refer them, please open the chat and let them know.
              </p>
              <a href="${APP_URL}" style="${btnStyle}">Open MRN →</a>
            </div>
          </div>
        </div>
      `
    } else {
      return Response.json({ error: 'Unknown notification type' }, { status: 400 })
    }

    // Send email
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject,
      html,
    })

    if (sendError) {
      console.error('Resend error:', sendError)
      return Response.json({ error: sendError.message }, { status: 500 })
    }

    return Response.json({ success: true })

  } catch (err) {
    console.error('Send notification error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
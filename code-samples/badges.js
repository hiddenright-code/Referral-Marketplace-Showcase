// School abbreviations for well-known universities
const SCHOOL_ABBREVIATIONS = {
  'Massachusetts Institute of Technology': 'MIT',
  'Stanford University': 'Stanford',
  'Harvard University': 'Harvard',
  'Yale University': 'Yale',
  'Columbia University': 'Columbia',
  'New York University': 'NYU',
  'University of California, Los Angeles': 'UCLA',
  'University of Southern California': 'USC',
  'University of California, Berkeley': 'UC Berkeley',
  'University of Oxford': 'Oxford',
  'University of Cambridge': 'Cambridge',
  'London School of Economics': 'LSE',
  'The Wharton School': 'Wharton',
  'University of Pennsylvania': 'UPenn',
  'University of Texas at Austin': 'UT Austin',
  'Georgia Institute of Technology': 'Georgia Tech',
  'Carnegie Mellon University': 'Carnegie Mellon',
  'University of Michigan': 'U of Michigan',
  'Cornell University': 'Cornell',
  'Princeton University': 'Princeton',
  'Duke University': 'Duke',
}

// Degree priority order (higher index = higher priority)
const DEGREE_PRIORITY = {
  'High School': 0,
  'Associate': 1,
  'BBA': 2,
  'BSc': 2,
  'BA': 2,
  'BSc Engineering': 2,
  'MBA': 3,
  'JD': 3,
  'MD': 3,
  'MSc': 4,
  'MA': 4,
  'PhD': 5,
}

export function abbreviateSchool(school) {
  if (!school) return ''
  return SCHOOL_ABBREVIATIONS[school] || school
}

export function getHighestDegree(education) {
  if (!education) return null
  const priority = DEGREE_PRIORITY[education.degree_type] ?? 0
  return { ...education, priority }
}

export function buildEducationBadge(education, featuredEducation = null) {
  if (!education) return null

  // Use featured override if set
  const degreeType = featuredEducation || education.degree_type
  if (!degreeType) return null

  const school = abbreviateSchool(education.school)
  const focus = education.focus

  // Format: "PhD CS · MIT" or "MSc · Stanford" if no focus
  if (focus && school) return `${degreeType} ${focus} · ${school}`
  if (school) return `${degreeType} · ${school}`
  return degreeType
}

export function buildExperienceBadge(employment) {
  if (!employment || employment.length === 0) return null

  const currentYear = new Date().getFullYear()

  // Build valid [start, end] ranges, skipping entries with missing years
  const ranges = []
  for (const emp of employment) {
    const start = parseInt(emp.start_year)
    const end = emp.is_current ? currentYear : parseInt(emp.end_year)
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      ranges.push([start, end])
    }
  }

  if (ranges.length === 0) return null

  // Sort by start year ascending
  ranges.sort((a, b) => a[0] - b[0])

  // Merge overlapping ranges
  const merged = [ranges[0]]
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]
    const [start, end] = ranges[i]
    if (start <= last[1]) {
      // Overlapping or adjacent — extend if needed
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }

  // Sum merged ranges
  const totalYears = merged.reduce((sum, [start, end]) => sum + (end - start), 0)

  if (totalYears <= 0) return null
  return `${totalYears} yr${totalYears === 1 ? '' : 's'} industry experience`
}

export function buildSeekerFeedBadges({ badges = [], seekerProfile = {}, education = null, employment = [], featuredEducation = null }) {
  const result = []

  // Trust badges first
  if (badges.find(b => b.badge_type === 'community_verified')) {
    result.push({ label: 'Community Verified', color: 'teal' })
  }
  if (badges.find(b => b.badge_type === 'portfolio_linked')) {
    result.push({ label: 'Portfolio Linked', color: 'amber' })
  }

  // Education badge
  const eduBadge = buildEducationBadge(education, featuredEducation)
  if (eduBadge) result.push({ label: eduBadge, color: 'purple' })

  // Student or Recent Grad badge
  if (education) {
    const isStudent = education.not_graduated === true
    const hasEmployment = employment && employment.length > 0
    const hasCurrentJob = employment?.some(e => e.is_current === true)
    const gradYear = parseInt(education.graduation_year)
    const currentYear = new Date().getFullYear()
    const isRecentGrad = !isStudent && gradYear >= currentYear - 1 && !hasCurrentJob && !hasEmployment

    if (isStudent) {
      result.push({ label: 'Student', color: 'blue' })
    } else if (isRecentGrad) {
      result.push({ label: 'Recent Grad', color: 'blue' })
    }
  }

  // Experience badge
  const expBadge = buildExperienceBadge(employment)
  if (expBadge) result.push({ label: expBadge, color: 'gray' })

  // Status badges
  if (seekerProfile.seeking_status === 'Actively seeking referrals') {
    result.push({ label: 'Actively Seeking', color: 'teal' })
  }
  if (seekerProfile.relocate_preference && seekerProfile.relocate_preference !== 'Not open to relocating') {
    result.push({ label: 'Open to Relocate', color: 'blue' })
  }
  if (seekerProfile.visa_status?.includes('Not required')) {
    result.push({ label: 'No Visa Required', color: 'green' })
  }

  return result
}

export function buildInsiderProfileBadges({ badges = [], insiderProfile = {}, education = null, employment = [], referralCount = 0, hireCount = 0 }) {
  const result = []

  // Trust badges
  if (badges.find(b => b.badge_type === 'community_verified')) {
    result.push({ label: 'Community Verified', color: 'teal' })
  }
  if (badges.find(b => b.badge_type === 'top_referrer')) {
    result.push({ label: 'Top Referrer', color: 'purple' })
  }
  if (badges.find(b => b.badge_type === 'halal_friendly_advocate')) {
    result.push({ label: 'Halal-Friendly Advocate', color: 'amber' })
  }

  // Education badge
  const eduBadge = buildEducationBadge(education)
  if (eduBadge) result.push({ label: eduBadge, color: 'purple' })

  // Experience badge
  const expBadge = buildExperienceBadge(employment)
  if (expBadge) result.push({ label: expBadge, color: 'gray' })

  // Role level
  if (insiderProfile.role_level) {
    result.push({ label: insiderProfile.role_level, color: 'blue' })
  }

  // Referral milestones
  if (referralCount >= 10) {
    result.push({ label: `${referralCount} Referrals Submitted`, color: 'teal' })
  }
  if (hireCount >= 1) {
    result.push({ label: `${hireCount} ${hireCount === 1 ? 'Hire' : 'Hires'}`, color: 'green' })
  }

  return result
}
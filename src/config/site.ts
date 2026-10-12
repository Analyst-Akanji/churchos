// Edit this file to change the public website. Live data (services, events, sermons,
// announcements) comes from the database. Everything below is static text.
// Hero images are NOT configured here: drop optimised photos in src/assets/hero (see README).

export const SITE = {
  shortName: 'GOFAMINT Mount Zion Sanctuary',
  fullName: 'The Gospel Faith Mission International (GOFAMINT)',
  assembly: 'Mount Zion Sanctuary',
  district: 'P.P.S Osogbo, Ring Road District',
  city: 'Osogbo, Osun State, Nigeria',
  tagline: 'A family of faith, worship and good success.',
  yearTheme: { year: 2026, title: 'Our year of Good Success', anchor: 'Psalm 138:8' },

  hero: {
    eyebrow: 'Welcome home',
    lines: ['Worship with us.', 'Grow in faith.'],
    accent: 'Walk in good success.',
    sub: 'Join the Mount Zion Sanctuary family every Sunday for Sunday school and worship. Everyone is welcome.',
  },
  pillars: [
    { icon: 'heart', title: 'Worship', note: 'Exalting God together' },
    { icon: 'book', title: 'Grow', note: 'Growing in the Word' },
    { icon: 'hands', title: 'Serve', note: 'Serving our community' },
  ],

  contact: { phone: '', email: '', whatsapp: '', mapUrl: '' }, // fill in
  social: { facebook: '', instagram: '', youtube: '' },        // full URLs; empty ones are hidden

  about: [
    'Mount Zion Sanctuary is an assembly of the Gospel Faith Mission International (GOFAMINT), meeting in the Ring Road District, Osogbo.',
    'We gather every Sunday for Sunday school and worship, and through the week for prayer and fellowship. Everyone is welcome.',
  ],
  aboutPoints: ['Biblical teaching', 'A warm, friendly family', 'Sunday school for every age', 'Children, youth and adults ministries', 'Opportunities to serve'],

  // Edit to match the assembly's real ministries. Icons: book, baby, users, heart, flower, hands, flame, music, church
  ministries: [
    { icon: 'book',   title: 'Sunday School', note: 'Classes for every age, every Sunday.' },
    { icon: 'baby',   title: 'Children',      note: 'Safe, fun and faith-building for little ones.' },
    { icon: 'flame',  title: 'Youth',         note: 'Young people who connect, grow and lead.' },
    { icon: 'users',  title: 'Men',           note: 'Men growing in faith and integrity.' },
    { icon: 'flower', title: 'Women',         note: 'Women encouraging one another in Christ.' },
    { icon: 'music',  title: 'Choir & Worship', note: 'Leading the congregation in praise.' },
  ],

  // Fallback programme shown until services are scheduled in the app. Replace with the real times.
  weeklyProgramme: [
    { day: 'Sunday', time: 'Sunday school', note: 'Classes for children, youth and adults' },
    { day: 'Sunday', time: 'Worship service', note: 'Main service' },
  ],

  // Optional sections. Leave empty to hide them: they only appear when filled in.
  giving: { url: '', note: 'Your generosity helps us serve our community and spread the gospel.' },
  stats: [] as { value: string; label: string }[],                       // e.g. { value: '2002', label: 'Serving since' }
  testimonials: [] as { quote: string; name: string; place?: string }[],  // use real, permitted testimonies only
};

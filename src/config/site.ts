// Edit this file to change the public website. Live data (this week's programme, events, sermons,
// commsannouncements) comes from the database. Everything below is static text.
// Hero photos: drop optimised images in src/assets/hero. About photo: src/assets/about (see README).

export const SITE = {
  shortName: 'GOFAMINT Mount Zion Sanctuary',
  fullName: 'The Gospel Faith Mission International (GOFAMINT)',
  assembly: 'Mount Zion Sanctuary',
  district: 'P.P.S Osogbo, Ring Road District',
  city: 'Osogbo, Osun State, Nigeria',
  tagline: 'The Church with the Word for the World',
  yearTheme: { year: 2026, title: 'Our year of Good Success', anchor: 'Psalm 138:8' },

  hero: {
    eyebrow: 'Welcome home',
    lines: ['Preach the Word.', 'Teach the Word.'],
    accent: 'Live the Word.',
    sub: 'Join the Mount Zion Sanctuary family every Sunday for Sunday school and worship. Everyone is welcome.',
  },
  // The three pillars come from the church's own statement of purpose.
  pillars: [
    { icon: 'church', title: 'Preach', note: 'Bringing people into God\u2019s family' },
    { icon: 'book',   title: 'Teach',  note: 'Growing in freedom and maturity' },
    { icon: 'heart',  title: 'Live',   note: 'Showing the new life in Christ' },
  ],

  // Shown on the Contact page and in the top bar. Any field left empty is hidden.
  // whatsapp: country code, no + and no leading 0.
  contact: {
    phone: '08033578281',
    email: 'osogbo@gofamintpps.com',
    whatsapp: '2348033578281',
    address: 'Opposite Galaxy Hotel, Temidire Estate Road, Ring Road, Osogbo, Osun State 230284',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Galaxy+Hotel+Temidire+Estate+Road+Ring+Road+Osogbo',
  },
  social: { facebook: '', instagram: '', youtube: '' },        // full URLs; empty ones are hidden

  about: [
    'Mount Zion Sanctuary is an assembly of the Gospel Faith Mission International (GOFAMINT), meeting in the Ring Road District, Osogbo.',
    'We gather every Sunday for Sunday school and worship, and through the week for prayer and fellowship. Everyone is welcome.',
  ],
  aboutPoints: ['Biblical teaching', 'A warm, friendly family', 'Sunday school for every age', 'Children, youth and adults ministries', 'Opportunities to serve'],

  // The church's statement of purpose, as displayed on the assembly's signboard.
  purpose: {
    title: 'Our statement of purpose',
    items: [
      { before: 'To ', key: 'preach the Word', after: ' of God and bring people into membership of God\u2019s family.' },
      { before: 'To ', key: 'teach the Word', after: ' of God to enhance freedom, promote Christian maturity and bind the people to God for service; and' },
      { before: 'To ', key: 'live the Word', after: ' of God to demonstrate the new life in Christ to the world, and ensure security of the believer.' },
    ],
    motto: 'The Church with the Word for the World',
  },

  // Edit to match the assembly's real ministries. Icons: book, baby, users, heart, flower, hands, flame, music, church
  ministries: [
    { icon: 'book',   title: 'Sunday School', note: 'Classes for every age, every Sunday.' },
    { icon: 'baby',   title: 'Children',      note: 'Safe, fun and faith-building for little ones.' },
    { icon: 'flame',  title: 'Youth',         note: 'Young people who connect, grow and lead.' },
    { icon: 'users',  title: 'Men',           note: 'Men growing in faith and integrity.' },
    { icon: 'flower', title: 'Women',         note: 'Women encouraging one another in Christ.' },
    { icon: 'music',  title: 'Choir & Worship', note: 'Leading the congregation in praise.' },
  ],

  // Optional sections. Leave empty to hide them: they only appear when filled in.
  giving: { url: '', note: 'Your generosity helps us serve our community and spread the gospel.' },
  stats: [] as { value: string; label: string }[],                       // e.g. { value: '2002', label: 'Serving since' }
  testimonials: [] as { quote: string; name: string; place?: string }[],  // use real, permitted testimonies only
};

/** URL-friendly id for a ministry, e.g. 'Choir & Worship' becomes 'choir-worship'. */
export const ministrySlug = (title: string) =>
  title.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

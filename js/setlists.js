// What each concert is likely to play: the set from a recent show of the same tour, or the
// tour's own guide where no single night was posted. It is a guide, not the night's running
// order: tours swap songs from city to city, and the Jakarta night is only known on the night.
// Song titles only, each list with where it came from. Shown in show mode (Plus, seatplus.js).
// Keyed by event id; BTS plays one set on every night, so its ids share one list.
const S = (from, url, songs, partial = false) => ({ from, url, songs: songs.split('|'), partial });

const LISTS = {
  bts: S('ARIRANG World Tour, Tottenham Hotspur Stadium, London, 6 and 7 July 2026 (Official Charts)',
    'https://www.officialcharts.com/chart-news/bts-arirang-world-tour-setlist-2026-in-full-songs-for-london-tottenham-stadium/',
    "Hooligan|Aliens|Run BTS (remix)|they don't know 'bout us|Like Animals|FAKE LOVE (remix)|SWIM|Merry Go Round|2.0|NORMAL|Not Today (remix)|MIC Drop|FYA|Fire|Body to Body|IDOL|Come Over|Butter|Dynamite|Airplane pt.2|Outro: Wings|Please|Into the Sun"),
  'evt-bocelli-jakarta': S('Romanza 30th Anniversary World Tour, the tour’s usual programme (SeatGeek)',
    'https://seatgeek.com/blog/what-to-expect-at-andrea-bocellis-romanza-30th-anniversary-world-tour-setlist-start-time-and-more',
    'Con te partirò|Vivo per lei|Romanza|Il mare calmo della sera|Caruso|Vivere|La voce del silenzio|Canto della terra|Miserere|Because We Believe|Besame Mucho|Ave Maria|E lucevan le stelle|Nessun dorma|Time to Say Goodbye'),
  'evt-mcr-jakarta': S('The Black Parade 2026 Tour, the album in full then the second set (Music Feeds)',
    'https://musicfeeds.com.au/features/my-chemical-romance-the-black-parade-2026-tour-setlist/',
    "The End.|Dead!|This Is How I Disappear|The Sharpest Lives|Welcome to the Black Parade|I Don't Love You|House of Wolves|Cancer|Mama|Sleep|Teenagers|Disenchanted|Famous Last Words|The End.|Bury Me in Black|Our Lady of Sorrows|Na Na Na|The Ghost of You|To the End|Give 'Em Hell, Kid|Vampires Will Never Hurt You|I'm Not Okay (I Promise)|Boy Division|Helena"),
  'evt-gnr-jakarta': S('World Tour 2026 (Music Feeds)',
    'https://musicfeeds.com.au/features/guns-n-roses-world-tour-2026-setlist/',
    "Welcome to the Jungle|Mr. Brownstone|Bad Obsession|Live and Let Die|Slither|Chinese Democracy|Pretty Tied Up|It's So Easy|Yesterdays|Double Talkin' Jive|Sabbath Bloody Sabbath|Nothin'|Dead Horse|Perhaps|Civil War|Atlas|Knockin' on Heaven's Door|Slash guitar solo|Sweet Child o' Mine|November Rain|Patience|New Rose|Down on the Farm|Don't Cry|Nightrain|Paradise City"),
  'evt-5sos-jakarta': S('EVERYONE’S A STAR! World Tour, opening night, Uncasville, 29 May 2026 (Ticketmaster)',
    'https://blog.ticketmaster.com/5-seconds-of-summer-setlist/',
    "NOT OK|No. 1 Obsession|Teeth|Easier|More|istillfeelthesame|No Shame|She's Kinda Hot|Boyband|Telephone Busy|Evolve|Bad Omens|Ghost of You|I'm Scared I'll Never Sleep Again|Starting Line|Have U Found What Ur Looking For?|Don't Forget You Love Me|enough|Amnesia|Disconnected|English Love Affair|Voodoo Doll|Waste the Night|Jet Black Heart|She Looks So Perfect|Everyone's a Star!|Youngblood"),
  'evt-nflying-jakarta': S('Busan, 15 November 2026 (setlist.fm)',
    'https://www.setlist.fm/setlist/nflying/2026/busan-exhibition-and-convention-center-auditorium-busan-south-korea-b7d4d4e.html',
    'Anyway|4242|Pardon?|Rooftop|Songbird|Wake Up|Awesome|Say Goodbye|Moon & Cheese|Run Like This|In Between Seasons|Into You|Lovefool|Our Ending|Autumn Dream|Everlasting|Blue Moon|Dangerously|Up All Night|Shooting Star|Oh really.|Preview|Moebius|GOOD BAM'),
  bigbang: S('XX : COSMOS World Tour, Goyang Stadium (SeatGeek)',
    'https://seatgeek.com/blog/what-to-expect-at-bigbangs-xx-cosmos-world-tour-setlist-start-time-more',
    'Fantastic Baby|Hands Up|Tonight|Blue|Loser|If You|Bad Boy|Bae Bae|Haru Haru|Lies|Universe|Wings|Look at Me, Gwisun|BAD|Ringa Linga|LIVE FAST DIE SLOW|POWER|GOOD BOY|Crayon|Crooked|Bang Bang Bang|Stupid Liar|Sober|We Like 2 Party|BiiiG|HOME SWEET HOME|MY HEAVEN|Sunset Glow|LAST FAREWELL'),
  'evt-enhypen-jakarta': S('BLOOD SAGA World Tour, opening night, KSPO Dome, Seoul, 1 May 2026 (setlist.fm)',
    'https://www.setlist.fm/news/05-26/enhypen-kick-off-blood-saga-world-tour-with-two-live-debuts-63d6a27b',
    'Knife|Daydream|Outside|No Doubt|Blockbuster|Go Big or Go Home|Stealer|Drunk-Dazed|Bite Me|Fate|Criminal Love|Lost Island|XO (Only If You Say Yes)|Blind|Helium|SHOUT OUT', true),
  'evt-maroon5-jakarta': S('Latin America 2026 Tour, Nuevo Nayarit, 12 November 2026 (setlist.fm)',
    'https://www.setlist.fm/setlist/maroon-5/2026/explanada-vidantaworld-nuevo-nayarit-mexico-73765235.html',
    "Harder to Breathe|Lucky Strike|This Love|Stereo Hearts|Animals|One More Night|Misery|Sunday Morning|Heavy|Won't Go Home Without You|Memories|She Will Be Loved|Maps|Love Somebody|Don't Wanna Know|What Lovers Do|Makes Me Wonder|Girls Like You|Moves Like Jagger|Payphone|Sugar"),
  'evt-thescript-jakarta': S('The songs played most on the 2026 shows (setlist.fm)',
    'https://www.setlist.fm/stats/average-setlist/the-script-53d657dd.html?year=2026',
    "Superheroes|Man in the Arena|Rain|Paint the Town Green|Nothing|The Crowd Was Singing Wonderwall|For the First Time|Hall of Fame|The Man Who Can't Be Moved|Breakeven|If You Could See Me Now"),
  'evt-m2m-jakarta': S('Mexico City, 24 January 2026 (setlist.fm)',
    'https://www.setlist.fm/setlists/m2m-13d6196d.html',
    "The Day You Went Away|Everything You Do|The Minute|I Don't Want to Talk About It|Love Left For Me|Girl in Your Dreams|Here I Am|Don't|Under the Surface|If a Song Could Get Me You|What You Do About Me|Driving", true),
  'evt-boynextdoor-jakarta': S('KNOCK ON Vol.2, Madison Square Garden, New York, 7 November 2026 (SeatGeek)',
    'https://seatgeek.ca/blog/what-to-expect-at-boynextdoors-knock-on-vol-2-tour-setlist-start-time-merch-front-row',
    "06070|VIRAL|But Sometimes|I Feel Good|123-78|IF I SAY, I LOVE YOU|Live In Paris|So let's go see the stars|Forever You|Hollywood Action|Nice Guy|Earth, Wind & Fire|ANIMAL|ddok ddok ddok|One and Only|JAM!|Bathroom|Dangerous|Gonna Be a Rock|ADIOS!|l i f e i s c o o l|Count to Love|I Wonder|Upside Down"),
  'evt-westlife-jakarta': S('The 25th Anniversary World Tour (Hello Rayo)',
    'https://www.hellorayo.co.uk/news/music/pop/westlife-2026-tour-setlist',
    "World of Our Own|Uptown Girl|Bop Bop Baby|What About Now|When You're Looking Like That|What Makes a Man|I Have a Dream|I Lay My Love on You|Starlight|Queen of My Heart|Chariot|Fool Again|If I Let You Go|My Love|Unbreakable|Mandy|Flying Without Wings|Hello My Love|You Raise Me Up|Swear It Again"),
};

// The list for an event, or null when no recent set from its tour has been posted yet.
export function setlistFor(id) {
  if (!id) return null;
  if (id.startsWith('evt-bts-arirang')) return LISTS.bts;
  if (id.startsWith('evt-bigbang-')) return LISTS.bigbang;
  return LISTS[id] || null;
}

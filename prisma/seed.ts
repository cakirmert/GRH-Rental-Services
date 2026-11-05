//------------------------------------------------------------------
//  prisma/seed.ts
//------------------------------------------------------------------
import "dotenv/config"
import { PrismaClient, Role, ItemType, type Prisma } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import fs from "fs/promises"
import path from "path"
import { localSeedDatabaseUrl } from "./seedSafety"

async function main() {
  const connectionString = localSeedDatabaseUrl(process.env)
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, ssl: false }) })
  try {
    await prisma.$transaction(seedLocalData, { timeout: 30000 })
    console.log("🌱 Local seed finished successfully")
  } finally {
    await prisma.$disconnect()
  }
}

async function seedLocalData(prisma: Prisma.TransactionClient) {
  /* Reset is restricted to explicitly opted-in local databases above. */
  await prisma.notification.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.item.deleteMany()
  await prisma.user.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.authState.deleteMany()
  await prisma.log.deleteMany()

  const now = new Date()

  /* ───── Users ─────────────────────────────────────────────────── */
  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Admin Account",
      role: Role.ADMIN,
      emailVerified: now,
    },
  })

  async function localImages(paths: string[]): Promise<string[]> {
    return Promise.all(
      paths.map(async (imagePath) => {
        try {
          await fs.access(path.join(process.cwd(), "public", imagePath.replace(/^\//, "")))
          return imagePath
        } catch {
          // The repository does not include the production equipment photographs.
          return "/gustav.png"
        }
      }),
    )
  }

  /* ───── Helper image groups ──────────────────────────────────── */
  const barPics = await localImages([
    "/photos/Bar14.jpg",
    "/photos/Bar6.jpg",
    "/photos/Bar13.jpg",
    "/photos/Bar3.jpg",
  ])
  const loungePics = await localImages(["/photos/Lounge1.jpg"])
  const hallPics = await localImages([
    "/photos/Sporthalle2.jpg",
    "/photos/Sporthalle6.jpg",
    "/photos/Sporthalle7.jpg",
  ])
  const tearoomPics = await localImages([
    "/photos/Tearoom12.jpg",
    "/photos/Tearoom19.jpg",
    "/photos/Tearoom13.jpg",
    "/photos/Tearoom4.jpg",
  ])
  const canoePics = await localImages([
    "/photos/Boats1.jpg",
    "/photos/Boats2.jpg",
    "/photos/Boats3.jpg",
    "/photos/Boats5.jpg",
    "/photos/Boats6.jpg",
  ])

  const footballImg = (await localImages(["/photos/Games/Football.jpg"]))[0]
  const basketballImg = (await localImages(["/photos/Games/Basketball.jpg"]))[0]
  const volleyballImg = (await localImages(["/photos/Games/Volleyballs.jpg"]))[0]
  const gustavImg = (await localImages(["/gustav.png"]))[0]
  const ballpumpImg = (await localImages(["/photos/ballpump.png"]))[0]

  /* ───── Items (rooms, sports, board games) ────────────────── */
  const items = [
    /* ---------- ROOMS ---------- */
    {
      type: ItemType.ROOM,
      titleEn: "Bar",
      titleDe: "Bar",
      descriptionEn: "Cosy place to hang out.",
      descriptionDe: "Gemütlicher Treffpunkt zum Ausklingen lassen.",
      rulesEn: "- No outside drinks\n- Clean tables after use",
      rulesDe: "- Keine Getränke von außen\n- Tische nach Nutzung reinigen",
      capacity: 50,
      imagesJson: JSON.stringify(barPics),
    },
    {
      type: ItemType.ROOM,
      titleEn: "Lounge",
      titleDe: "Lounge",
      descriptionEn: "Relaxed seating area for residents.",
      descriptionDe: "Entspannter Sitzbereich für Bewohner.",
      rulesEn: "- Keep noise low after 22:00",
      rulesDe: "- Nach 22 Uhr leise sein",
      capacity: 15,
      imagesJson: JSON.stringify(loungePics),
    },
    {
      type: ItemType.ROOM,
      titleEn: "Sports Hall",
      titleDe: "Sporthalle",
      descriptionEn: "Indoor facility for basketball, badminton & more.",
      descriptionDe: "Halle für Basketball, Badminton u. v. m.",
      rulesEn: "- Indoor shoes only\n- Lights off after use",
      rulesDe: "- Nur Hallenschuhe\n- Licht nach Nutzung ausschalten",
      capacity: 50,
      imagesJson: JSON.stringify(hallPics),
    },
    {
      type: ItemType.ROOM,
      titleEn: "Tearoom",
      titleDe: "Teestube",
      descriptionEn: "Perfect for a quiet cup of tea, a study group, or a cozy gathering.",
      descriptionDe: "Ideal für eine ruhige Tasse Tee, eine Lerngruppe oder eine gemütliche Runde",
      capacity: 15,
      imagesJson: JSON.stringify(tearoomPics),
    },

    /* ---------- SPORTS EQUIPMENT ---------- */
    {
      type: ItemType.SPORTS,
      titleEn: "3-seat Canoe",
      titleDe: "3er Kanu",
      descriptionEn: "Discover Hamburg’s waterways with friends.",
      descriptionDe: "Erkunde Hamburgs Wasserwege mit Freunden.",
      rulesEn: "- Life jackets required\n- Max. 3 people",
      rulesDe: "- Schwimmwesten Pflicht\n- Max. 3 Personen",
      capacity: 3,
      imagesJson: JSON.stringify(canoePics),
    },
    {
      type: ItemType.SPORTS,
      titleEn: "Football",
      titleDe: "Fußball",
      descriptionEn: "Standard-size football for matches.",
      descriptionDe: "Standard Fußball zum kicken.",
      imagesJson: JSON.stringify([footballImg]),
    },
    {
      type: ItemType.SPORTS,
      titleEn: "Basketball",
      titleDe: "Basketball",
      descriptionEn: "Standard basketball for hooping.",
      descriptionDe: "Standard-Basketball für Spiele.",
      imagesJson: JSON.stringify([basketballImg]),
    },
    {
      type: ItemType.SPORTS,
      titleEn: "Volleyball",
      titleDe: "Volleyball",
      descriptionEn: "Official ball, ideal for outdoor play.",
      descriptionDe: "Offizieller Ball, ideal für draußen.",
      imagesJson: JSON.stringify([volleyballImg]),
    },

    /* ---------- OTHER ITEMS ---------- */
    {
      type: ItemType.OTHER,
      titleEn: "Vaccuum Cleaner",
      titleDe: "Staubsauger",
      descriptionEn: "For efficient (and less noisy) cleaning",
      descriptionDe: "Für effizientes (und leiseres) Reinigen.",
      rulesEn: "Short-time borrowing\nDeposit of 50€ required in cash.",
      rulesDe: "Kurzzeit-Ausleihe\nKaution von 50€ in bar erforderlich.",
      imagesJson: JSON.stringify([gustavImg]),
    },

    {
      type: ItemType.OTHER,
      titleEn: "Ball Pump",
      titleDe: "Ballpumpe",
      descriptionEn: "For pumping balls and wheels",
      descriptionDe: "Zum Aufpumpen von Bällen und Reifen",
      rulesEn: "Short-time borrowing\nDeposit of 50€ required in cash.",
      rulesDe: "Kurzzeit-Ausleihe\nKaution von 50 € in bar erforderlich.",
      imagesJson: JSON.stringify([ballpumpImg]),
    },

    {
      type: ItemType.OTHER,
      titleEn: "Volleyball Net",
      titleDe: "Volleyballnetz",
      descriptionEn: "Set up your volleyball game at any beach or park conveniently",
      descriptionDe: "Einfaches Aufstellen für Volleyballspiele im Park oder am Strand",
      rulesEn: "Short-time borrowing\nDeposit of 50€ required in cash.",
      rulesDe: "Kurzzeit-Ausleihe\nKaution von 50 € in bar erforderlich.",
      imagesJson: JSON.stringify([gustavImg]),
    },

    /* ---------- BOARD & CARD GAMES ---------- */
    ...(await Promise.all(
      [
        [
          "UNO",
          "UNO.png",
          "2-10",
          "Fast-paced colour-matching card game.",
          "Schnelles Farb-Matching-Kartenspiel.",
        ],
        [
          "Jenga",
          "jenga.png",
          "2+",
          "Stack the blocks—don't let the tower topple!",
          "Stapelt die Blöcke—lasst den Turm nicht umfallen!",
        ],
        [
          "Monopoly",
          "Monopoly.png",
          "2-8",
          "Classic property-trading board game.",
          "Klassisches Immobilien-Brettspiel.",
        ],
        [
          "Chess",
          "chess.png",
          "2",
          "Timeless strategy game of kings, queens and pawns.",
          "Zeitloses Strategiespiel mit Königen, Damen und Bauern.",
        ],
        [
          "Abalone",
          "Abalone.png",
          "2",
          "Abstract strategy of pushing marbles off the board.",
          "Abstraktes Strategiespiel—stoße Murmeln vom Brett.",
        ],
        [
          "Bad People",
          "Badpeople.png",
          "3-10",
          "Hilarious voting party game.",
          "Lustiges Abstimmungs-Partyspiel.",
        ],
        [
          "Tick Tack Bumm",
          "Bumm.png",
          "2-12",
          "Pass the bomb before it explodes—find words fast!",
          "Gib die Bombe weiter bevor sie explodiert—finde schnell Wörter!",
        ],
        [
          "Cards Against Humanity",
          "Cah.png",
          "4-20",
          "Fill-in-the-blank humour for terrible people.",
          "Lückentext-Humor für schreckliche Menschen.",
        ],
        [
          "Carcassonne",
          "Carcassonne.png",
          "2-5",
          "Tile-laying game building a medieval landscape.",
          "Legespiel zum Aufbau einer mittelalterlichen Landschaft.",
        ],
        [
          "Codenames",
          "Codenames.png",
          "2-8",
          "Team word-association spy game.",
          "Team-Wortassoziations-Spionagespiel.",
        ],
        [
          "Dixit",
          "Dixit.png",
          "3-8",
          "Storytelling with surreal art cards.",
          "Geschichtenerzählen mit surrealen Kunstkarten.",
        ],
        [
          "Dog Deluxe",
          "Dogdeluxe.png",
          "2-6",
          "Team race—get your marbles home with card tactics.",
          "Teamrennen—bringe deine Murmeln mit Kartentaktik nach Hause.",
        ],
        [
          "Dschunke",
          "Dschunke.png",
          "3-5",
          "Strategic trading in a Chinese river market.",
          "Strategischer Handel auf einem chinesischen Flussmarkt.",
        ],
        [
          "Exploding Kittens",
          "Explodingkittens.png",
          "2-5",
          "Russian-roulette style kitten card game.",
          "Russisches-Roulette-artiges Kätzchen-Kartenspiel.",
        ],
        [
          "The Game of Life",
          "Leben.png",
          "2-6",
          "Roll and move through life's big moments.",
          "Würfle und bewege dich durch die großen Momente des Lebens.",
        ],
        [
          "Ligretto",
          "Ligretto.png",
          "2-4",
          "Lightning-fast simultaneous card race.",
          "Blitzschnelles simultanes Kartenrennen.",
        ],
        [
          "Millionen",
          "Millionen.png",
          "2-6",
          "Card game of bidding and bluffing for big money.",
          "Kartenspiel mit Bieten und Bluffen um viel Geld.",
        ],
        [
          "Party Pong",
          "Partypong.png",
          "2-4",
          "Portable beer-pong set—sink the cups to win.",
          "Tragbares Beer-Pong-Set—versenke die Becher um zu gewinnen.",
        ],
        [
          "Qwirkle",
          "Qwirkle.png",
          "2-4",
          "Pattern-building with colourful tiles.",
          "Musterbildung mit bunten Steinen.",
        ],
        [
          "Risiko",
          "Risiko.png",
          "2-6",
          "Global conquest strategy with dice and armies.",
          "Globale Eroberungsstrategie mit Würfeln und Armeen.",
        ],
        [
          "Rommee",
          "Rommee.png",
          "2-6",
          "Classic rummy meld-building card game.",
          "Klassisches Rommé-Kartenspiel.",
        ],
        [
          "Spielesammlung",
          "Sammlung.png",
          "2-6",
          "Collection of timeless family classics in one box.",
          "Sammlung zeitloser Familienklassiker in einer Box.",
        ],
        [
          "Scotland Yard",
          "Scotlandyard.png",
          "3-6",
          "Detective chase across London.",
          "Detektiv-Verfolgungsjagd durch London.",
        ],
        [
          "Secret Hitler",
          "Secrethitler.png",
          "5-10",
          "Social deduction—liberals vs. fascists.",
          "Soziale Deduktion—Liberale gegen Faschisten.",
        ],
        [
          "Catan",
          "Siedler.png",
          "3-4",
          "Trade, build and settle on an uncharted island.",
          "Handle, baue und besiedle eine unerforschte Insel.",
        ],
        [
          "Skip-Bo",
          "Skipbo.png",
          "2-6",
          "Sequencing card game—empty your stock pile first.",
          "Sequenz-Kartenspiel—leere zuerst deinen Stapel.",
        ],
        [
          "Tabu",
          "Tabu.png",
          "4-10",
          "Guess the word without using forbidden clues.",
          "Errate das Wort ohne verbotene Hinweise zu verwenden.",
        ],
        [
          "Twister",
          "Twister.png",
          "2-4",
          "Party game that ties players in knots.",
          "Partyspiel das Spieler in Knoten verwandelt.",
        ],
        [
          "What Do You Meme",
          "Wdym.png",
          "3-20",
          "Caption viral pics with the funniest phrase.",
          "Untertitel virale Bilder mit dem lustigsten Spruch.",
        ],
        [
          "Werewolf",
          "Werewolf.png",
          "8-18",
          "Hidden-role elimination of villagers vs. werewolves.",
          "Versteckte-Rollen-Eliminierung von Dorfbewohnern gegen Werwölfe.",
        ],
      ].map(async ([title, file, players, descEn, descDe]) => {
        const [img] = await localImages([`/photos/Games/${file}`])
        return {
          type: ItemType.GAME,
          titleEn: title,
          titleDe: title,
          descriptionEn: descEn,
          descriptionDe: descDe,
          players,
          imagesJson: JSON.stringify([img]),
        }
      }),
    )),
  ] satisfies NonNullable<Parameters<typeof prisma.item.createMany>[0]>["data"]

  await prisma.item.createMany({ data: items })

  /* ───── Assign responsible members per item type ────────────── */
  if (!admin) throw new Error("admin not created")

  const allItems = await prisma.item.findMany({ select: { id: true, type: true } })
  await Promise.all(
    allItems.map(({ id, type }) =>
      prisma.item.update({
        where: { id },
        data: {
          responsibleMembers: {
            connect: [{ id: admin.id }, ...(type === ItemType.SPORTS ? [{ id: admin.id }] : [])],
          },
        },
      }),
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local seed failed.")
  process.exitCode = 1
})

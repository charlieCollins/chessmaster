// frontend/src/data/openings.ts

export type OpeningKey =
  | "italian"
  | "spanish"
  | "scotch"
  | "kings-gambit"
  | "petrov"
  | "sicilian"
  | "french"
  | "caro-kann"
  | "scandinavian"
  | "vienna"
  | "queens-gambit"
  | "kings-indian"
  | "nimzo-indian"
  | "grunfeld"
  | "queens-indian"
  | "dutch"
  | "london"
  | "english";

export interface OpeningLine {
  name: string;
  moves: string[]; // SAN strings applied in sequence
  description: string;
}

export interface OpeningData {
  name: string;
  icon: string;
  firstMoves: string; // display text only
  description: string;
  lines: OpeningLine[];
}

export const OPENINGS: Record<OpeningKey, OpeningData> = {

  // ── 1.e4 Openings ───────────────────────────────────────────────────────────

  italian: {
    name: "Italian Game",
    icon: "♗",
    firstMoves: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
    description:
      "One of the oldest openings. White develops quickly, targets the f7 square, and looks to control the centre with d4. Very popular at all levels.",
    lines: [
      {
        name: "Giuoco Piano",
        moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d4","exd4","cxd4","Bb4+"],
        description:
          'The "Quiet Game" that can become very sharp. White prepares d4 with c3. After 6.cxd4 Black checks with Bb4+, gaining a tempo. Classic Romantic-era chess.',
      },
      {
        name: "Evans Gambit",
        moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4","Bxb4","c3","Ba5","d4"],
        description:
          "White sacrifices the b-pawn to accelerate central play. The compensation is a powerful centre and open lines for the pieces. A favourite of Paul Morphy and Bobby Fischer.",
      },
      {
        name: "Two Knights Defense",
        moves: ["e4","e5","Nf3","Nc6","Bc4","Nf6","Ng5","d5","exd5","Na5"],
        description:
          "Black fights back immediately with 3...Nf6. White jumps to g5 to threaten f7. After 4...d5! the position becomes very tactical — sharp play for both sides.",
      },
      {
        name: "Hungarian Defense",
        moves: ["e4","e5","Nf3","Nc6","Bc4","Be7","d4","exd4","Nxd4"],
        description:
          "A solid, modest choice for Black. The bishop goes to e7 rather than the more active c5. White gets a slight edge from superior piece activity but the position stays balanced.",
      },
    ],
  },

  spanish: {
    name: "Ruy López",
    icon: "♗",
    firstMoves: "1.e4 e5 2.Nf3 Nc6 3.Bb5",
    description:
      "One of the deepest and most studied openings. White pins the knight that defends e5, seeking long-term positional pressure. A favourite of world champions for 150 years.",
    lines: [
      {
        name: "Morphy Defense",
        moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","O-O"],
        description:
          "The main line. Black chases the bishop with a6, then develops naturally. White plays Re1 to support the centre and prepares the thematic d4 break.",
      },
      {
        name: "Berlin Defense",
        moves: ["e4","e5","Nf3","Nc6","Bb5","Nf6","O-O","Nxe4","d4","Nd6","Bxc6","dxc6","dxe5","Nf5"],
        description:
          'The "Berlin Wall" — notoriously solid and drawish. Black trades knight for bishop to double White\'s c-pawns. A favourite of top-level defensive players including Vladimir Kramnik.',
      },
      {
        name: "Exchange Variation",
        moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Bxc6","dxc6","O-O","f6","d4","exd4","Nxd4"],
        description:
          "White immediately trades the bishop for the knight, giving Black doubled c-pawns. Black gets the bishop pair. A direct approach that simplifies the structure early.",
      },
      {
        name: "Steinitz Defense Deferred",
        moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","d6","c3","Nf6","d4"],
        description:
          "Black plays ...d6 instead of ...Nf6 on move 4, solidly defending e5. White responds with c3-d4. Less ambitious than the main line but very solid — a safe choice for Black.",
      },
    ],
  },

  "kings-gambit": {
    name: "King's Gambit",
    icon: "♙",
    firstMoves: "1.e4 e5 2.f4",
    description:
      "An aggressive gambit from the Romantic era. White offers the f-pawn to seize the centre and create attacking chances. Double-edged — accepting it leads to wild, tactical play.",
    lines: [
      {
        name: "KGA — Kieseritzky Gambit",
        moves: ["e4","e5","f4","exf4","Nf3","g5","h4","g4","Ne5"],
        description:
          "Black accepts the gambit and tries to hold the extra pawn with ...g5. White attacks with h4. After 5.Ne5 the position is extremely sharp — one mistake can be fatal.",
      },
      {
        name: "KGA — Cunningham Defense",
        moves: ["e4","e5","f4","exf4","Nf3","Be7","Bc4","Bh4+","Kf1","d6"],
        description:
          "Black accepts but plays 3...Be7, setting up a sly check with Bh4+. After 4.Kf1 White can't castle but gains activity. A tricky sideline that White must know.",
      },
      {
        name: "KGD — Classical",
        moves: ["e4","e5","f4","Bc5","Nf3","d6","c3","Nc6","d4","exd4","cxd4","Bb4+"],
        description:
          "Black declines with 2...Bc5, keeping the pawn structure intact. Play resembles the Italian. White still gets a strong centre — the gambit character shifts to positional pressure.",
      },
      {
        name: "Falkbeer Counter-Gambit",
        moves: ["e4","e5","f4","d5","exd5","e4","d3","Nf6","dxe4","Nxe4"],
        description:
          "Black counter-attacks immediately with 2...d5! Instead of defending, Black offers their own pawn. After 3...e4 the black centre is powerful and White must prove the gambit was sound.",
      },
    ],
  },

  sicilian: {
    name: "Sicilian Defense",
    icon: "♞",
    firstMoves: "1.e4 c5",
    description:
      "The most popular reply to 1.e4. Black fights for the centre asymmetrically — not mirroring White's pawn but attacking from the flank. Leads to rich, unbalanced positions.",
    lines: [
      {
        name: "Najdorf",
        moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"],
        description:
          "Bobby Fischer called it 'best by test'. The move 5...a6 prepares queenside expansion and prevents Nb5. The most ambitious and theoretically rich line in all of chess.",
      },
      {
        name: "Dragon",
        moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6","Be3","Bg7","f3","O-O","Qd2","Nc6"],
        description:
          "Black fianchettos the king's bishop to create a powerful diagonal. White usually launches the Yugoslav Attack (Be3, f3, Qd2, O-O-O) for a mutual king-hunt across the board.",
      },
      {
        name: "Classical",
        moves: ["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","e5","Nb5","d6"],
        description:
          "Black develops the knight to c6 and plays ...e5 to gain space. White's knight is driven to b5. The resulting Boleslavsky-type structure gives Black a solid but slightly passive position.",
      },
      {
        name: "Kan (Flexible Sicilian)",
        moves: ["e4","c5","Nf3","e6","d4","cxd4","Nxd4","a6","Nc3","Qc7"],
        description:
          "Black plays ...e6 and ...a6 to keep maximum flexibility. The queen comes to c7 to support the centre. A solid, tricky system that avoids White's main-line preparation.",
      },
    ],
  },

  french: {
    name: "French Defense",
    icon: "♟",
    firstMoves: "1.e4 e6",
    description:
      "A solid, reliable reply to 1.e4. Black accepts a cramped position in exchange for a very sturdy pawn structure. Play often becomes a race: White attacks kingside, Black counterattacks queenside.",
    lines: [
      {
        name: "Advance Variation",
        moves: ["e4","e6","d4","d5","e5","c5","c3","Nc6","Nf3","Qb6"],
        description:
          "White pushes 3.e5 to gain space immediately. Black strikes back with ...c5, attacking d4. White must be careful to defend d4 while keeping the space advantage.",
      },
      {
        name: "Exchange Variation",
        moves: ["e4","e6","d4","d5","exd5","exd5","Nf3","Nf6","Bd3","Bd6"],
        description:
          "White exchanges on d5, creating a symmetrical pawn structure. The resulting position is equal but offers White the slightly better piece activity. A quieter, less theoretical option.",
      },
      {
        name: "Winawer Variation",
        moves: ["e4","e6","d4","d5","Nc3","Bb4","e5","c5","a3","Bxc3+","bxc3"],
        description:
          "The sharpest French. Black pins the knight immediately. White advances e5 and after the bishop trade, gets the bishop pair but doubled c-pawns. Black counterattacks with ...c5 and queenside play.",
      },
      {
        name: "Classical Variation",
        moves: ["e4","e6","d4","d5","Nc3","Nf6","Bg5","Be7","e5","Nfd7","Bxe7","Qxe7"],
        description:
          "Black develops with ...Nf6 instead of ...Bb4. After 4.Bg5 the game enters the Classical French. White trades bishop for knight and closes the centre — a strategic battle.",
      },
    ],
  },

  "caro-kann": {
    name: "Caro-Kann Defense",
    icon: "♟",
    firstMoves: "1.e4 c6",
    description:
      "A solid defense that prepares ...d5 without blocking the c8 bishop. Known for its solid structure and endgame prospects. A favourite of defensive-minded players.",
    lines: [
      {
        name: "Classical Variation",
        moves: ["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5","Ng3","Bg6","h4","h6","Nf3","Nd7"],
        description:
          "The most popular line. Black solves the light-squared bishop problem immediately by playing ...Bf5. White chases the bishop with Ng3; Black retreats to g6 and fights for equality.",
      },
      {
        name: "Advance Variation",
        moves: ["e4","c6","d4","d5","e5","Bf5","Nf3","e6","Be2","Nd7","O-O","Ne7"],
        description:
          "White grabs space with 3.e5. Black develops the bishop to f5 before closing the position, then plays ...Ne7 to later reroute to f5 or d7-f6. A solid setup for Black.",
      },
      {
        name: "Exchange Variation",
        moves: ["e4","c6","d4","d5","exd5","cxd5","Bd3","Nc6","c3","Nf6","Nf3","Bg4"],
        description:
          "White exchanges on d5 early. The resulting symmetrical structure is slightly better for White due to the bishop pair and more active development, but Black is very solid.",
      },
    ],
  },

  scotch: {
    name: "Scotch Game",
    icon: "♗",
    firstMoves: "1.e4 e5 2.Nf3 Nc6 3.d4",
    description:
      "White strikes at the centre immediately with 3.d4, sidestepping the deep theory of the Spanish. After 3...exd4 4.Nxd4, sharp tactical play erupts. Popularised by Garry Kasparov in the 1990s.",
    lines: [
      {
        name: "Classical (4...Bc5)",
        moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Bc5","Be3","Qf6","c3","Nge7"],
        description:
          "Black develops the bishop aggressively to c5, hitting the d4 knight. White defends with Be3 and c3. Both queens become active quickly — a tactical, sharp position.",
      },
      {
        name: "Schmidt Variation (4...Nf6)",
        moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nc3","Bb4","Nxc6","bxc6","Bd3","d5"],
        description:
          "Black develops the knight to f6, pressuring e4. After 5.Nc3 Bb4 the pin creates tension. White trades knights off, doubling Black's c-pawns, then Black frees with ...d5.",
      },
      {
        name: "Mieses Variation (4...Nf6 5.Nxc6)",
        moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nxc6","bxc6","e5","Qe7","Qe2"],
        description:
          "White immediately trades the d4 knight for the c6 knight, then pushes e5 to gain space. The queen comes to e7 to blockade. A solid positional choice for White.",
      },
    ],
  },

  petrov: {
    name: "Petrov Defense",
    icon: "♞",
    firstMoves: "1.e4 e5 2.Nf3 Nf6",
    description:
      "Black mirrors White's attack on e5 immediately. One of the most solid defenses — drawish at the top level but very sound. Loved by defensive players who want to survive the opening.",
    lines: [
      {
        name: "Classical Defense",
        moves: ["e4","e5","Nf3","Nf6","Nxe5","d6","Nf3","Nxe4","d4","d5","Bd3","Bd6","O-O","O-O"],
        description:
          "The main line. White takes e5 then retreats the knight — necessary, since 4.Nxf7?? Qe7 is terrible. After the symmetrical pawn structure arises, play is balanced but strategic.",
      },
      {
        name: "Three Knights Variation",
        moves: ["e4","e5","Nf3","Nf6","Nc3","Nc6","d4","exd4","Nxd4","Bb4"],
        description:
          "White sidesteps the classical line with 3.Nc3. After 3...Nc6 we reach a Four Knights, then 4.d4 sharpens quickly. Black pins with Bb4 to fight for equality.",
      },
      {
        name: "Cochrane Gambit",
        moves: ["e4","e5","Nf3","Nf6","Nxe5","d6","Nxf7","Kxf7","d4","d5","exd5","Nc6"],
        description:
          "A wild gambit — White sacrifices a whole piece! After Nxf7 Kxf7, White plays d4 and claims rapid development and the bishop pair for the piece. Black must defend precisely.",
      },
    ],
  },

  scandinavian: {
    name: "Scandinavian Defense",
    icon: "♛",
    firstMoves: "1.e4 d5",
    description:
      "Black immediately challenges the centre with 1...d5, the oldest recorded defence to 1.e4. After 2.exd5 Black recaptures with the queen — an early queen development that requires accurate play.",
    lines: [
      {
        name: "Main Line (2...Qxd5 3...Qa5)",
        moves: ["e4","d5","exd5","Qxd5","Nc3","Qa5","d4","Nf6","Nf3","Bf5","Bc4"],
        description:
          "The most popular line. After Nc3 kicks the queen, it retreats to a5. Black develops Nf6 and Bf5 to achieve a solid, active setup. White must be careful of the ...Bxc2 trick.",
      },
      {
        name: "Modern (2...Nf6 3.c4 c6)",
        moves: ["e4","d5","exd5","Nf6","c4","c6","dxc6","Nxc6","Nc3","e5","Nf3"],
        description:
          "Black recaptures with the knight and immediately plays ...c6 to challenge White's c4 pawn. After the exchange, Black gets fast development and central counterplay with ...e5.",
      },
      {
        name: "Icelandic-Palme Gambit",
        moves: ["e4","d5","exd5","Nf6","c4","e6","dxe6","Bxe6","d4","Bb4+"],
        description:
          "Black sacrifices a pawn after 2...Nf6 3.c4 e6!? — the Icelandic Gambit. After dxe6 Bxe6, Black has rapid piece development and attacking chances, especially on the kingside.",
      },
    ],
  },

  vienna: {
    name: "Vienna Game",
    icon: "♘",
    firstMoves: "1.e4 e5 2.Nc3",
    description:
      "White develops the knight before deciding on f4. It can transpose into a King's Gambit with 3.f4 or take a quieter route. Flexible and increasingly popular at club level.",
    lines: [
      {
        name: "Vienna Gambit",
        moves: ["e4","e5","Nc3","Nc6","f4","exf4","Nf3","g5","d4","g4","Bc4"],
        description:
          "White plays f4 anyway, and Black accepts with exf4 then tries to hold with ...g5. White strikes back with d4 and Bc4. More restrained than the King's Gambit but equally sharp.",
      },
      {
        name: "Max Lange Attack",
        moves: ["e4","e5","Nc3","Nf6","Bc4","Nxe4","Qh5","Nd6","Bb3","Nc6","Nb5","g6","Qf3","f5"],
        description:
          "After 2...Nf6 3.Bc4, Black can take the pawn with 3...Nxe4. White fires back with Qh5 and a full attack. A sharp tactical battle where the initiative matters more than material.",
      },
      {
        name: "Quiet Setup (Bc4 d3)",
        moves: ["e4","e5","Nc3","Nf6","Bc4","Bc5","d3","Nc6","f4","d6","Nf3"],
        description:
          "White develops quietly with Bc4 and d3 before deciding on f4. This avoids wild lines and leads to a rich positional game — similar to the Italian but with the knight on c3.",
      },
    ],
  },

  // ── 1.d4 Openings ───────────────────────────────────────────────────────────

  "queens-gambit": {
    name: "Queen's Gambit",
    icon: "♛",
    firstMoves: "1.d4 d5 2.c4",
    description:
      "The most classical of the d4 openings. White offers the c-pawn to gain central control. Black must choose between accepting (QGA), declining solidly (QGD), or the flexible Slav.",
    lines: [
      {
        name: "QGD — Orthodox Defense",
        moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","e3","O-O","Nf3","h6","Bh4"],
        description:
          "The main line of the QGD. Black builds a solid fortress. After ...h6 Bh4 the tension grows — Black can try ...Ne4 or ...dxc4 at the right moment. A rich strategic battle.",
      },
      {
        name: "QGA — Accepted",
        moves: ["d4","d5","c4","dxc4","e3","Nf6","Bxc4","e6","Nf3","c5","O-O"],
        description:
          "Black accepts the gambit pawn. White recovers it quickly and gets a lead in development. Black can equalise with ...c5 to challenge the centre. An active choice for Black.",
      },
      {
        name: "Slav Defense",
        moves: ["d4","d5","c4","c6","Nf3","Nf6","Nc3","dxc4","a4","Bf5","e3","e6","Bxc4"],
        description:
          "Black supports d5 with c6 before deciding to accept the gambit. The c6 pawn also prepares to recapture on d5. Black can develop the c8 bishop freely — a key improvement over the QGD.",
      },
    ],
  },

  "kings-indian": {
    name: "King's Indian Defense",
    icon: "♞",
    firstMoves: "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6",
    description:
      "Black allows White to build a big pawn centre, then attacks it later with ...e5 or ...c5. An extremely dynamic and double-edged opening — one of the most fighting defenses in chess.",
    lines: [
      {
        name: "Classical Variation",
        moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Nf3","O-O","Be2","e5","O-O","Nc6","d5","Ne7"],
        description:
          "The main line. Black plays ...e5 and White closes with d5. Opposite-side pawn storms follow: White attacks queenside, Black storms the kingside. One of chess's most exciting structures.",
      },
      {
        name: "Sämisch Variation",
        moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","f3","O-O","Be3","e5","d5","Nh5"],
        description:
          "White plays f3 to build a massive pawn centre and prepare g4-g5 attacks. Black reroutes the knight with ...Nh5 aiming for ...f5. A fierce, brawling encounter.",
      },
      {
        name: "Four Pawns Attack",
        moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","f4","O-O","Nf3","c5","d5"],
        description:
          "White grabs maximum space with four pawns on the 4th rank. Black counters with ...c5, attacking the centre. If White overextends, the centre can collapse — very risky for both sides.",
      },
    ],
  },

  london: {
    name: "London System",
    icon: "♗",
    firstMoves: "1.d4 d5 2.Nf3 Nf6 3.Bf4",
    description:
      "A solid, low-theory system. White sets up Bf4, e3, Nbd2, and Bd3 regardless of what Black does. Highly popular at club level for its reliability and consistency.",
    lines: [
      {
        name: "Standard Setup (vs ...e6)",
        moves: ["d4","d5","Nf3","Nf6","Bf4","e6","e3","c5","c3","Nc6","Nbd2","Bd6","Bg3","O-O"],
        description:
          "White completes the London setup methodically. After 5...Nc6 Black challenges with ...Bd6 to trade off the light-squared bishop. White retreats to g3 and maintains the solid structure.",
      },
      {
        name: "London vs King's Indian Setup",
        moves: ["d4","Nf6","Nf3","g6","Bf4","Bg7","e3","O-O","Be2","d6","O-O","Nbd7","h3","c5"],
        description:
          "Black goes for a King's Indian fianchetto setup. White continues with Be2, O-O. The London remains solid even against the fianchetto — h3 prevents any Bg4 tricks.",
      },
    ],
  },

  "nimzo-indian": {
    name: "Nimzo-Indian Defense",
    icon: "♝",
    firstMoves: "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4",
    description:
      "One of chess's most respected defenses. Black immediately pins the c3 knight, preventing e4 and creating long-term pressure on the pawn structure. A favourite of all world champions.",
    lines: [
      {
        name: "Classical (4.Qc2)",
        moves: ["d4","Nf6","c4","e6","Nc3","Bb4","Qc2","O-O","a3","Bxc3+","Qxc3","b6","Bg5","Bb7"],
        description:
          "White protects against doubling with Qc2, then plays a3 to force the bishop trade. Black gets the bishop pair after Bxc3+. A rich, strategic battle — used by Karpov and Fischer.",
      },
      {
        name: "Rubinstein (4.e3)",
        moves: ["d4","Nf6","c4","e6","Nc3","Bb4","e3","O-O","Bd3","d5","Nf3","c5","O-O","Nc6"],
        description:
          "Solid and classical. White develops naturally with e3, Bd3, Nf3 and prepares O-O. Black plays ...d5 and ...c5 to contest the centre. A positional tussle with mutual chances.",
      },
      {
        name: "Sämisch (4.a3)",
        moves: ["d4","Nf6","c4","e6","Nc3","Bb4","a3","Bxc3+","bxc3","c5","f3","d5","cxd5","exd5"],
        description:
          "White immediately forces the bishop trade, accepting doubled c-pawns in exchange for the bishop pair. After f3 and e4, White aims for a massive centre. Black counterattacks with ...c5 and ...d5.",
      },
    ],
  },

  grunfeld: {
    name: "Grünfeld Defense",
    icon: "♞",
    firstMoves: "1.d4 Nf6 2.c4 g6 3.Nc3 d5",
    description:
      "A hypermodern classic. Black allows White to build a big pawn centre on e4+d4, then attacks it with pieces. Named after Ernst Grünfeld (1926), revived spectacularly by Bobby Fischer.",
    lines: [
      {
        name: "Exchange Variation",
        moves: ["d4","Nf6","c4","g6","Nc3","d5","cxd5","Nxd5","e4","Nxc3","bxc3","Bg7","Nf3","c5","Be3","O-O"],
        description:
          "White takes on d5, Black retakes, then White plays e4 to claim maximum centre. Black attacks it at once with Bg7 and ...c5. The resulting tension is the heart of the Grünfeld.",
      },
      {
        name: "Russian System (4.Nf3)",
        moves: ["d4","Nf6","c4","g6","Nc3","d5","Nf3","Bg7","Qb3","dxc4","Qxc4","O-O","e4","a6"],
        description:
          "White plays Qb3 to hit d5 and b7 simultaneously. Black gives up the d5 pawn with dxc4 and castles. The queen on c4 is active but exposed — Black seeks counterplay with ...a6 and ...b5.",
      },
      {
        name: "Neo-Grünfeld (3.Nf3)",
        moves: ["d4","Nf6","c4","g6","Nf3","Bg7","g3","d5","cxd5","Nxd5","Bg2","O-O","O-O","c5"],
        description:
          "White avoids Nc3, keeping options open. The fianchetto with g3+Bg2 creates a quieter but deep positional game. Black plays ...c5 to pressure the centre after castling.",
      },
    ],
  },

  "queens-indian": {
    name: "Queen's Indian Defense",
    icon: "♝",
    firstMoves: "1.d4 Nf6 2.c4 e6 3.Nf3 b6",
    description:
      "Black fianchettos the queen's bishop to b7, targeting the central light squares. A sophisticated defense that avoids the Nimzo (after 3.Nf3 instead of 3.Nc3). Popular with positional players.",
    lines: [
      {
        name: "Main Line (4.g3)",
        moves: ["d4","Nf6","c4","e6","Nf3","b6","g3","Bb7","Bg2","Be7","O-O","O-O","Nc3","Ne4"],
        description:
          "White fianchettos in reply, aiming the Bg2 against the Bb7. Black develops Be7 and castles. After ...Ne4, Black tries to exchange pieces and equalise. A rich strategic battle.",
      },
      {
        name: "Petrosian System (4.a3)",
        moves: ["d4","Nf6","c4","e6","Nf3","b6","a3","Bb7","Nc3","d5","cxd5","Nxd5","Qc2"],
        description:
          "White plays a3 to prevent Bb4+ ideas and prepare b4. After ...Bb7 and ...d5, the game opens up. Petrosian used this to squeeze small advantages without risk.",
      },
      {
        name: "Classical (4.e3)",
        moves: ["d4","Nf6","c4","e6","Nf3","b6","e3","Bb7","Bd3","d5","b3","Bd6","O-O","O-O"],
        description:
          "Solid and straightforward. Both sides develop harmoniously — White plays e3, Bd3, b3 and castles. Black mirrors on the queenside. A pleasant strategic game without sharp tactics.",
      },
    ],
  },

  dutch: {
    name: "Dutch Defense",
    icon: "♙",
    firstMoves: "1.d4 f5",
    description:
      "An aggressive, unbalanced defence. Black grabs kingside space immediately with ...f5, aiming for an attack. Three major systems exist: Stonewall (solid), Leningrad (dynamic), and Classical (flexible).",
    lines: [
      {
        name: "Leningrad Variation",
        moves: ["d4","f5","g3","Nf6","Bg2","g6","Nf3","Bg7","O-O","O-O","c4","d6"],
        description:
          "Black fianchettos the kingside bishop for maximum activity. The Leningrad Dutch is the most dynamic variation — Black dreams of a kingside pawn storm after ...Ne4 and ...g5.",
      },
      {
        name: "Stonewall Variation",
        moves: ["d4","f5","c4","Nf6","g3","e6","Bg2","d5","Nf3","c6","O-O","Bd6"],
        description:
          "Black builds the 'Stonewall' pawn formation: d5+e6+f5+c6. The structure is very solid but the e5 square is weak. Black develops the bishop to d6 and plans a kingside attack.",
      },
      {
        name: "Classical Variation",
        moves: ["d4","f5","Nf3","e6","g3","Nf6","Bg2","Be7","O-O","O-O","c4","d6","Nc3","Qe8"],
        description:
          "A flexible setup — Black delays committing the c-pawn. The queen comes to e8, preparing ...Qh5 or ...Ne4. White builds a broad centre while Black prepares the inevitable kingside attack.",
      },
    ],
  },

  // ── Flank Openings ───────────────────────────────────────────────────────────

  english: {
    name: "English Opening",
    icon: "♗",
    firstMoves: "1.c4",
    description:
      "A hypermodern flank opening. White controls d5 with the c-pawn rather than occupying the centre directly. Extremely flexible — often transposes to Queen's Gambit or King's Indian structures.",
    lines: [
      {
        name: "Symmetrical Variation",
        moves: ["c4","c5","Nf3","Nf6","Nc3","Nc6","g3","g6","Bg2","Bg7","O-O","O-O"],
        description:
          "Black mirrors White's setup completely. Both sides fianchetto and castle. The resulting symmetrical position is rich and deceptive — small differences in piece placement decide the game.",
      },
      {
        name: "King's English (1...e5)",
        moves: ["c4","e5","Nc3","Nf6","Nf3","Nc6","g3","Bb4","Bg2","O-O"],
        description:
          "Black occupies the centre with ...e5. White develops with Nf3, g3, Bg2. After ...Bb4, Black pins the c3 knight — similar to the Nimzo-Indian but with White playing 1.c4.",
      },
      {
        name: "Reversed Sicilian",
        moves: ["c4","e5","Nc3","Nf6","g3","d5","cxd5","Nxd5","Bg2","Nb6","Nf3","Nc6"],
        description:
          "White plays a Sicilian with colours reversed (a tempo up). After 3...d5 cxd5, Black must be careful — the fianchetto bishop on g2 exerts long-term pressure on the queenside.",
      },
    ],
  },
};

// Grouped by first move for the hub page
export const E4_OPENINGS: OpeningKey[]   = ["italian","spanish","scotch","kings-gambit","petrov","sicilian","french","caro-kann","scandinavian","vienna"];
export const D4_OPENINGS: OpeningKey[]   = ["queens-gambit","kings-indian","nimzo-indian","grunfeld","queens-indian","dutch","london"];
export const FLANK_OPENINGS: OpeningKey[] = ["english"];

import database from "../service/database.js";
import multer from "multer";
import path from "path";
import fs from "fs";

// ✅ โฟลเดอร์รูปภาพ
const HERO_IMG_DIR = path.resolve("img_hero");
if (!fs.existsSync(HERO_IMG_DIR)) fs.mkdirSync(HERO_IMG_DIR, { recursive: true });

// ✅ รายการ Sprite 7 รูป
const HERO_SPRITES = [
  { key: "attack1", suffix: "attack-1" }, { key: "attack2", suffix: "attack-2" },
  { key: "idle1", suffix: "idle-1" }, { key: "idle2", suffix: "idle-2" },
  { key: "walk1", suffix: "walk-1" }, { key: "walk2", suffix: "walk-2" }, { key: "guard1", suffix: "guard-1" },
];

function spriteFilename(id, suffix) { return `${id}-${suffix}.png`; }

function deleteAllHeroSprites(id) {
  for (const s of HERO_SPRITES) {
    const p = path.join(HERO_IMG_DIR, spriteFilename(id, s.suffix));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function ensureHeroExists(id) {
  const r = await database.query(`SELECT id FROM hero WHERE id=$1`, [id]);
  return r.rowCount > 0;
}

// ------------------------------
// multer Config
// ------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, HERO_IMG_DIR),
  filename: (req, file, cb) => {
    const { id } = req.params;
    const found = HERO_SPRITES.find((x) => x.key === file.fieldname);
    if (!found) return cb(new Error("Invalid fieldname"), "");
    cb(null, spriteFilename(id, found.suffix));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only PNG/JPG/WEBP allowed"), false);
    cb(null, true);
  },
});

// ------------------------------
// CRUD (GET/POST/PUT/DELETE)
// ------------------------------

// ✅ GET hero
export async function getHero(req, res) {
  try {
    const result = await database.query(`
      SELECT 
        h.*,
        COALESCE(d.hero_deck, '[]'::jsonb) AS hero_deck
      FROM hero h
      LEFT JOIN (
        SELECT 
          hero_id,
          JSONB_AGG(JSONB_BUILD_OBJECT('id', id, 'effect', effect, 'size', size)) AS hero_deck
        FROM hero_deck
        GROUP BY hero_id
      ) d ON d.hero_id = h.id
      ORDER BY h.id
    `);
    return res.status(200).json(result.rows);
  } catch (error) { return res.status(500).json({ message: error.message }); }
}

// ✅ CREATE hero
export async function createHero(req, res) {
  const client = await database.connect();
  try {
    const { 
      id, name, price, description, hp, power, speed, 
      talk_win, talk_clear_stage, 
      ability_cost, 
      hero_deck = [] 
    } = req.body;

    await client.query("BEGIN");

    // นำ slot_lv, ability_code และ ability_description ออก
    await client.query(
      `INSERT INTO hero (id, name, price, description, hp, power, speed, talk_win, talk_clear_stage, ability_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, name, Number(price), description, Number(hp), Number(power), Number(speed), 
        talk_win, talk_clear_stage, 
        ability_cost === undefined || ability_cost === "" ? null : Number(ability_cost)
      ]
    );

    for (const card of hero_deck) {
      await client.query(`INSERT INTO hero_deck (hero_id, effect, size) VALUES ($1, $2, $3)`, [id, card.effect, card.size]);
    }

    await client.query("COMMIT");
    return res.status(201).json({ message: "hero created" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ UPDATE hero
export async function updateHero(req, res) {
  const { id } = req.params;
  const client = await database.connect();
  try {
    const { 
      name, price, description, hp, power, speed, 
      talk_win, talk_clear_stage, 
      ability_cost, 
      hero_deck = [] 
    } = req.body;

    await client.query("BEGIN");

    // อัปเดตโดยไม่มี slot_lv, ability_code และ ability_description
    await client.query(
      `UPDATE hero SET 
        name=$1, price=$2, description=$3, hp=$4, power=$5, speed=$6, 
        talk_win=$7, talk_clear_stage=$8, ability_cost=$9 
       WHERE id=$10`,
      [
        name, Number(price), description, Number(hp), Number(power), Number(speed), 
        talk_win, talk_clear_stage, 
        ability_cost === undefined || ability_cost === "" ? null : Number(ability_cost),
        id
      ]
    );

    await client.query(`DELETE FROM hero_deck WHERE hero_id = $1`, [id]);
    for (const card of hero_deck) {
      await client.query(`INSERT INTO hero_deck (hero_id, effect, size) VALUES ($1, $2, $3)`, [id, card.effect, card.size]);
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "hero updated" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ DELETE hero
export async function deleteHero(req, res) {
  const client = await database.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    await client.query(`DELETE FROM hero_deck WHERE hero_id=$1`, [id]);
    const result = await client.query(`DELETE FROM hero WHERE id=$1`, [id]);
    
    if (result.rowCount === 0) { 
      await client.query("ROLLBACK"); 
      return res.status(404).json({ message: "hero not found" }); 
    }

    await client.query("COMMIT");
    deleteAllHeroSprites(id);
    return res.status(200).json({ message: "hero deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ Sprite Upload/Delete (คงเดิม)
export const uploadHeroSprites = [
  upload.fields(HERO_SPRITES.map((x) => ({ name: x.key, maxCount: 1 }))),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!(await ensureHeroExists(id))) return res.status(404).json({ message: "hero not found" });
      return res.status(200).json({ message: "hero sprites uploaded" });
    } catch (error) { return res.status(500).json({ message: error.message }); }
  },
];

export async function deleteHeroSprites(req, res) {
  try {
    const { id } = req.params;
    if (!(await ensureHeroExists(id))) return res.status(404).json({ message: "hero not found" });
    deleteAllHeroSprites(id);
    return res.status(200).json({ message: "hero sprites deleted" });
  } catch (error) { return res.status(500).json({ message: error.message }); }
}
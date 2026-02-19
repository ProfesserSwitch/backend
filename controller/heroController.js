import database from "../service/database.js";

import multer from "multer";
import path from "path";
import fs from "fs";

// ✅ โฟลเดอร์รูปจริง
const HERO_IMG_DIR = path.resolve("img_hero");
if (!fs.existsSync(HERO_IMG_DIR)) fs.mkdirSync(HERO_IMG_DIR, { recursive: true });

// ✅ 7 รูป (ตาม requirement)
const HERO_SPRITES = [
  { key: "attack1", suffix: "attack-1" },
  { key: "attack2", suffix: "attack-2" },
  { key: "idle1", suffix: "idle-1" },
  { key: "idle2", suffix: "idle-2" },
  { key: "walk1", suffix: "walk-1" },
  { key: "walk2", suffix: "walk-2" },
  { key: "guard1", suffix: "guard-1" },
];

function spriteFilename(id, suffix) {
  return `${id}-${suffix}.png`;
}
function spritePath(id, suffix) {
  return path.join(HERO_IMG_DIR, spriteFilename(id, suffix));
}
function deleteAllHeroSprites(id) {
  for (const s of HERO_SPRITES) {
    const p = spritePath(id, s.suffix);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
async function ensureHeroExists(id) {
  const r = await database.query(`SELECT id FROM hero WHERE id=$1`, [id]);
  return r.rowCount > 0;
}

// ------------------------------
// multer: upload 7 รูปด้วย fields
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
// CRUD เหมือนเดิม (GET/POST/PUT/DELETE)
// ------------------------------
export async function getHero(req, res) {
  try {
    const result = await database.query("SELECT * FROM hero ORDER BY id");
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function createHero(req, res) {
  try {
    const {
      id,
      name,
      price,
      description,
      hp_lv,
      power_lv,
      speed_lv,
      slot_lv,
      talk_win,
      talk_clear_stage,

      // ✅ เพิ่ม ability fields
      ability_code,
      ability_description,
      ability_cost,
    } = req.body;

    await database.query(
      `
      INSERT INTO hero
      (id, name, price, description, hp_lv, power_lv, speed_lv, slot_lv, talk_win, talk_clear_stage,
       ability_code, ability_description, ability_cost)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        id,
        name,
        Number(price),
        description ?? null,
        Number(hp_lv),
        Number(power_lv),
        Number(speed_lv),
        Number(slot_lv),
        talk_win ?? null,
        talk_clear_stage ?? null,

        // ✅ ability fields
        ability_code ?? null,
        ability_description ?? null,
        ability_cost === undefined || ability_cost === "" ? null : Number(ability_cost),
      ]
    );

    return res.status(201).json({ message: "hero created" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function updateHero(req, res) {
  try {
    const { id } = req.params;
    const exists = await ensureHeroExists(id);
    if (!exists) return res.status(404).json({ message: "hero not found" });

    const {
      name,
      price,
      description,
      hp_lv,
      power_lv,
      speed_lv,
      slot_lv,
      talk_win,
      talk_clear_stage,

      // ✅ เพิ่ม ability fields
      ability_code,
      ability_description,
      ability_cost,
    } = req.body;

    await database.query(
      `
      UPDATE hero SET
        name=$1,
        price=$2,
        description=$3,
        hp_lv=$4,
        power_lv=$5,
        speed_lv=$6,
        slot_lv=$7,
        talk_win=$8,
        talk_clear_stage=$9,
        ability_code=$10,
        ability_description=$11,
        ability_cost=$12
      WHERE id=$13
      `,
      [
        name,
        Number(price),
        description ?? null,
        Number(hp_lv),
        Number(power_lv),
        Number(speed_lv),
        Number(slot_lv),
        talk_win ?? null,
        talk_clear_stage ?? null,

        // ✅ ability fields
        ability_code ?? null,
        ability_description ?? null,
        ability_cost === undefined || ability_cost === "" ? null : Number(ability_cost),

        id,
      ]
    );

    return res.status(200).json({ message: "hero updated" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function deleteHero(req, res) {
  try {
    const { id } = req.params;
    const result = await database.query(`DELETE FROM hero WHERE id=$1`, [id]);

    if (result.rowCount === 0) return res.status(404).json({ message: "hero not found" });

    deleteAllHeroSprites(id);
    return res.status(200).json({ message: "hero deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ------------------------------
// ✅ POST /hero/:id/sprites (ต้องครบ 7 รูป)
// fields: attack1 attack2 idle1 idle2 walk1 walk2 guard1
// ------------------------------
export const uploadHeroSprites = [
  upload.fields(HERO_SPRITES.map((x) => ({ name: x.key, maxCount: 1 }))),
  async (req, res) => {
    try {
      const { id } = req.params;
      const exists = await ensureHeroExists(id);
      if (!exists) return res.status(404).json({ message: "hero not found" });

      const missing = HERO_SPRITES.filter((x) => !req.files?.[x.key]?.[0]).map((x) => x.key);
      if (missing.length > 0) return res.status(400).json({ message: `missing files: ${missing.join(", ")}` });

      return res.status(200).json({ message: "hero sprites uploaded" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  },
];

export async function deleteHeroSprites(req, res) {
  try {
    const { id } = req.params;
    const exists = await ensureHeroExists(id);
    if (!exists) return res.status(404).json({ message: "hero not found" });

    deleteAllHeroSprites(id);
    return res.status(200).json({ message: "hero sprites deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
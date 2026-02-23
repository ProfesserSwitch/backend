import database from "../service/database.js";
import multer from "multer";
import path from "path";
import fs from "fs";

// 🔧 Sprite Config
const MONSTER_IMG_DIR = path.resolve("img_monster");
if (!fs.existsSync(MONSTER_IMG_DIR)) {
  fs.mkdirSync(MONSTER_IMG_DIR, { recursive: true });
}

function spriteFilenames(id) {
  return {
    attack1: `${id}-attack-1.png`,
    attack2: `${id}-attack-2.png`,
    idle1: `${id}-idle-1.png`,
    idle2: `${id}-idle-2.png`,
  };
}

function deleteSpriteFilesById(id) {
  const names = Object.values(spriteFilenames(id));
  for (const n of names) {
    const p = path.join(MONSTER_IMG_DIR, n);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function ensureMonsterExists(id) {
  const r = await database.query(`SELECT id FROM monster WHERE id=$1`, [id]);
  return r.rowCount > 0;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MONSTER_IMG_DIR),
  filename: (req, file, cb) => {
    const { id } = req.params;
    const map = spriteFilenames(id);
    const filename = map[file.fieldname];
    if (!filename) return cb(new Error("Invalid fieldname"), "");
    cb(null, filename);
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

// ✅ GET monsters (ใช้ JSONB เพื่อแก้ปัญหา Equality Operator)
export async function getMonster(req, res) {
  try {
    const result = await database.query(`
      SELECT 
        m.*,
        COALESCE(p.monster_moves, '[]'::jsonb) AS monster_moves,
        COALESCE(d.monster_deck, '[]'::jsonb) AS monster_deck
      FROM monster m
      LEFT JOIN (
        SELECT 
          monster_id,
          JSONB_AGG(
            JSONB_BUILD_OBJECT('pattern_no', pattern_no, 'moves', moves) 
            ORDER BY pattern_no
          ) AS monster_moves
        FROM (
          SELECT 
            monster_id, pattern_no,
            JSONB_AGG(
              JSONB_BUILD_OBJECT('pattern_order', pattern_order, 'pattern_move', pattern_move) 
              ORDER BY pattern_order
            ) AS moves
          FROM monster_move
          GROUP BY monster_id, pattern_no
        ) sub_p
        GROUP BY monster_id
      ) p ON p.monster_id = m.id
      LEFT JOIN (
        SELECT 
          monster_id,
          JSONB_AGG(
            JSONB_BUILD_OBJECT('id', id, 'effect', effect, 'size', size)
          ) AS monster_deck
        FROM monster_deck
        GROUP BY monster_id
      ) d ON d.monster_id = m.id
    `);
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ✅ CREATE monster
export async function createMonster(req, res) {
  const { id, no, name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost, monster_moves = [], monster_deck = [] } = req.body;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO monster (id, no, name, hp, power, description, exp, speed, "isBoss", quiz_move_code, quiz_move_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, no, name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost]
    );
    for (const pattern of monster_moves) {
      for (const move of pattern.moves) {
        await client.query(`INSERT INTO monster_move (monster_id, pattern_no, pattern_order, pattern_move) VALUES ($1,$2,$3,$4)`,
          [id, pattern.pattern_no, move.pattern_order, move.pattern_move]);
      }
    }
    for (const card of monster_deck) {
      await client.query(`INSERT INTO monster_deck (monster_id, effect, size) VALUES ($1, $2, $3)`, [id, card.effect, card.size]);
    }
    await client.query("COMMIT");
    return res.status(201).json({ message: "monster created" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ UPDATE monster
export async function updateMonster(req, res) {
  const { no, name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost, monster_moves = [], monster_deck = [] } = req.body;
  const { id } = req.params;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE monster SET no=$1, name=$2, hp=$3, power=$4, description=$5, exp=$6, speed=$7, "isBoss"=$8, quiz_move_code=$9, quiz_move_cost=$10 WHERE id=$11`,
      [no, name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost, id]
    );
    await client.query(`DELETE FROM monster_move WHERE monster_id = $1`, [id]);
    for (const pattern of monster_moves) {
      for (const move of pattern.moves) {
        await client.query(`INSERT INTO monster_move (monster_id, pattern_no, pattern_order, pattern_move) VALUES ($1,$2,$3,$4)`,
          [id, pattern.pattern_no, move.pattern_order, move.pattern_move]);
      }
    }
    await client.query(`DELETE FROM monster_deck WHERE monster_id = $1`, [id]);
    for (const card of monster_deck) {
      await client.query(`INSERT INTO monster_deck (monster_id, effect, size) VALUES ($1, $2, $3)`, [id, card.effect, card.size]);
    }
    await client.query("COMMIT");
    return res.status(200).json({ message: "monster updated" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ DELETE monster
export async function deleteMonster(req, res) {
  const { id } = req.params;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM monster_move WHERE monster_id = $1`, [id]);
    await client.query(`DELETE FROM monster_deck WHERE monster_id = $1`, [id]);
    const result = await client.query(`DELETE FROM monster WHERE id = $1`, [id]);
    if (result.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "monster not found" }); }
    await client.query("COMMIT");
    deleteSpriteFilesById(id);
    return res.status(200).json({ message: "monster deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally { client.release(); }
}

// ✅ Sprite Upload/Delete
export const uploadMonsterSprites = [
  upload.fields([{ name: "attack1", maxCount: 1 }, { name: "attack2", maxCount: 1 }, { name: "idle1", maxCount: 1 }, { name: "idle2", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!(await ensureMonsterExists(id))) return res.status(404).json({ message: "monster not found" });
      return res.status(200).json({ message: "sprites uploaded" });
    } catch (err) { return res.status(500).json({ message: err.message }); }
  },
];

export async function deleteMonsterSprites(req, res) {
  try {
    const { id } = req.params;
    if (!(await ensureMonsterExists(id))) return res.status(404).json({ message: "monster not found" });
    deleteSpriteFilesById(id);
    return res.status(200).json({ message: "sprites deleted" });
  } catch (err) { return res.status(500).json({ message: err.message }); }
}
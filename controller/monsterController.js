import database from "../service/database.js";

import multer from "multer";
import path from "path";
import fs from "fs";

// ------------------------------
// 🔧 Sprite config
// ------------------------------
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

// multer storage
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
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB ต่อรูป
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only PNG/JPG/WEBP allowed"), false);
    cb(null, true);
  },
});

// ------------------------------
// ✅ GET monsters
// ------------------------------
export async function getMonster(req, res) {
  try {
    const result = await database.query(`
      SELECT 
        m.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'pattern_no', p.pattern_no,
              'moves', p.moves
            )
            ORDER BY p.pattern_no
          ),
          '[]'
        ) AS monster_moves
      FROM monster m
      LEFT JOIN (
        SELECT 
          monster_id,
          pattern_no,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'pattern_order', pattern_order,
              'pattern_move', pattern_move
            )
            ORDER BY pattern_order
          ) AS moves
        FROM monster_move
        GROUP BY monster_id, pattern_no
      ) p 
        ON p.monster_id = m.id
      GROUP BY m.id
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ------------------------------
// ✅ CREATE monster
// แก้ไข: เพิ่ม quiz_move_code และ quiz_move_cost
// ------------------------------
export async function createMonster(req, res) {
  const {
    id,
    name,
    hp,
    power,
    description,
    exp,
    speed,
    isBoss,
    quiz_move_code, // เพิ่มใหม่
    quiz_move_cost, // เพิ่มใหม่
    monster_moves = []
  } = req.body;

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO monster
        (id, name, hp, power, description, exp, speed, "isBoss", quiz_move_code, quiz_move_cost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [id, name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost]
    );

    for (const pattern of monster_moves) {
      const { pattern_no, moves } = pattern;

      for (const move of moves) {
        await client.query(
          `
          INSERT INTO monster_move
            (monster_id, pattern_no, pattern_order, pattern_move)
          VALUES ($1,$2,$3,$4)
          `,
          [id, pattern_no, move.pattern_order, move.pattern_move]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({ message: "monster created" });

  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
}

// ------------------------------
// ✅ UPDATE monster
// แก้ไข: เพิ่ม quiz_move_code และ quiz_move_cost
// ------------------------------
export async function updateMonster(req, res) {
  const {
    name,
    hp,
    power,
    description,
    exp,
    speed,
    isBoss,
    quiz_move_code, // เพิ่มใหม่
    quiz_move_cost, // เพิ่มใหม่
    monster_moves = []
  } = req.body;

  const { id } = req.params;
  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE monster SET
        name=$1,
        hp=$2,
        power=$3,
        description=$4,
        exp=$5,
        speed=$6,
        "isBoss"=$7,
        quiz_move_code=$8,
        quiz_move_cost=$9
      WHERE id=$10
      `,
      [name, hp, power, description, exp, speed, isBoss, quiz_move_code, quiz_move_cost, id]
    );

    if (result.rowCount === 0) {
      throw new Error("monster not found");
    }

    await client.query(`DELETE FROM monster_move WHERE monster_id = $1`, [id]);

    for (const pattern of monster_moves) {
      for (const move of pattern.moves) {
        await client.query(
          `
          INSERT INTO monster_move 
            (monster_id, pattern_no, pattern_order, pattern_move)
          VALUES ($1,$2,$3,$4)
          `,
          [id, pattern.pattern_no, move.pattern_order, move.pattern_move]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "monster updated" });

  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
}

// ------------------------------
// ✅ DELETE monster
// ------------------------------
export async function deleteMonster(req, res) {
  const { id } = req.params;

  // ลบใน DB ก่อน
  const result = await database.query(`DELETE FROM monster WHERE id = $1`, [id]);

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "monster not found" });
  }

  // ลบไฟล์รูป (ถ้ามี)
  deleteSpriteFilesById(id);

  return res.status(200).json({ message: "monster deleted" });
}

// ------------------------------
// ✅ POST /monster/:id/sprites
// อัปโหลด 4 รูป (attack1, attack2, idle1, idle2) ต้องครบเท่านั้น
// ------------------------------
export const uploadMonsterSprites = [
  upload.fields([
    { name: "attack1", maxCount: 1 },
    { name: "attack2", maxCount: 1 },
    { name: "idle1", maxCount: 1 },
    { name: "idle2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const exists = await ensureMonsterExists(id);
      if (!exists) return res.status(404).json({ message: "monster not found" });

      const files = req.files || {};
      const required = ["attack1", "attack2", "idle1", "idle2"];
      const missing = required.filter((k) => !files[k] || files[k].length === 0);

      if (missing.length > 0) {
        return res.status(400).json({
          message: `missing files: ${missing.join(", ")} (ต้องอัปโหลดครบ 4 รูป)`,
        });
      }

      const base = `${req.protocol}://${req.get("host")}`;
      return res.status(200).json({
        message: "sprites uploaded",
        sprites: {
          attack1: `${base}/img_monster/${id}-attack-1.png`,
          attack2: `${base}/img_monster/${id}-attack-2.png`,
          idle1: `${base}/img_monster/${id}-idle-1.png`,
          idle2: `${base}/img_monster/${id}-idle-2.png`,
        },
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  },
];

// ------------------------------
// ✅ DELETE /monster/:id/sprites
// ลบรูปทั้งชุด 4 รูป
// ------------------------------
export async function deleteMonsterSprites(req, res) {
  try {
    const { id } = req.params;

    const exists = await ensureMonsterExists(id);
    if (!exists) return res.status(404).json({ message: "monster not found" });

    deleteSpriteFilesById(id);

    return res.status(200).json({ message: "sprites deleted" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
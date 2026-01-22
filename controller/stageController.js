import database from "../service/database.js";
import fs from "fs";
import path from "path";
import multer from "multer";

// ==================================================
// ✅ MULTER CONFIG (อยู่ใน controller ทั้งหมด)
// ==================================================

// เก็บเป็น img_map/{stageId}.png
const mapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "img_map"),
  filename: (req, file, cb) => {
    const { id } = req.params;
    cb(null, `${id}.png`);
  },
});

const mapFileFilter = (req, file, cb) => {
  if (file.mimetype !== "image/png") {
    return cb(new Error("Only PNG is allowed (image/png)"));
  }
  cb(null, true);
};

// export middleware ให้ route เรียกใช้
export const uploadStageMapMiddleware = multer({
  storage: mapStorage,
  fileFilter: mapFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single("map");

// handler error ของ multer ให้ตอบ JSON สวย ๆ
export function mapUploadErrorHandler(err, req, res, next) {
  if (!err) return next();

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large (max 5MB)" });
  }
  return res.status(400).json({ message: err.message || "Upload error" });
}

// ==================================================
// STAGE LIST
// ==================================================
export async function getAllStage(req, res) 
{
    console.log(`GET / Stage is Requested`);
    try {
      const result = await database.query('SELECT * FROM stage');
      return res.status(200).json(result.rows);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }   
}

export async function getStageEvents(req, res) {
  const { id } = req.params;
  console.log(`GET / Stage Info & Events (FINAL) for Stage ID: ${id}`);

  const client = await database.connect();

  try {
    // 1️⃣ ดึงข้อมูล Stage
    const stageResult = await client.query(
      `SELECT * FROM stage WHERE id = $1`,
      [id]
    );

    if (stageResult.rowCount === 0) {
      return res.status(404).json({ message: "Stage not found" });
    }

    const stageData = stageResult.rows[0];

    // 2️⃣ ดึง Monster Spawn + Monster + Move Pattern + Quiz Move Details
    const query = `
      SELECT
        se.id              AS spawn_id,
        se.stage_id,
        se.distant_spawn,

        m.id               AS monster_id,
        m.name,
        m.description,
        m.hp,              -- 🟢 แก้จาก max_hp
        m.power,           -- 🟢 แก้จาก atk_power_min/max รวมเป็น power
        -- m.armor ลบออกแล้ว
        m.exp,
        m.speed,
        m."isBoss",
        m.quiz_move_code,  -- 🟢 เพิ่ม
        m.quiz_move_cost,  -- 🟢 เพิ่ม

        -- 🟢 3️⃣ ดึงข้อมูล Quiz Move (แยกออกมาตามคำขอ)
        (
          SELECT json_build_object(
            'id', qm.id,
            'name', qm.move_name,
            'type', qm.type,
            'is_quiz', qm.is_quiz,
            'is_dash', qm.is_dash,
            'power', qm.power,
            'debuff_code', qm.debuff_code,
            'debuff_chance', qm.debuff_chance,
            'debuff_count', qm.debuff_count,
            'debuff_turn', qm.debuff_turn,
            'target', qm.target
          )
          FROM move qm
          WHERE qm.id = m.quiz_move_code
        ) AS quiz_move_info,

        -- 4️⃣ ดึงข้อมูล Move Pattern (เหมือนเดิม)
        (
          SELECT json_agg(
            json_build_object(
              'pattern_no', mp.pattern_no,
              'order', mp.pattern_order,
              'move', json_build_object(
                'id', mv.id,
                'name', mv.move_name,
                'type', mv.type,
                'is_quiz', mv.is_quiz,
                'is_dash', mv.is_dash,
                'power', mv.power,
                'debuff_code', mv.debuff_code,
                'debuff_chance', mv.debuff_chance,
                'debuff_count', mv.debuff_count,
                'debuff_turn', mv.debuff_turn,
                'target', mv.target
              )
            )
            ORDER BY mp.pattern_no, mp.pattern_order
          )
          FROM monster_move mp
          JOIN move mv ON mp.pattern_move = mv.id
          WHERE mp.monster_id = m.id
        ) AS pattern_list

      FROM monster_spawn se
      JOIN monster m ON se.monster_id = m.id
      WHERE se.stage_id = $1
      ORDER BY se.distant_spawn ASC
    `;

    const eventResult = await client.query(query, [id]);

    // 5️⃣ Group ตามระยะ spawn
    const groupedEvents = eventResult.rows.reduce((acc, row) => {
      const dist = Number(row.distant_spawn);

      let group = acc.find(g => g.distance === dist);

      const monsterData = {
        spawn_id: row.spawn_id,
        monster_id: row.monster_id,
        name: row.name,
        description: row.description,
        hp: row.hp,           // 🟢 อัปเดต
        power: row.power,     // 🟢 อัปเดต
        exp: row.exp,
        speed: row.speed,
        isBoss: row.isBoss,
        
        // ข้อมูล Quiz Move
        quiz_move_code: row.quiz_move_code,
        quiz_move_cost: row.quiz_move_cost,
        quiz_move_info: row.quiz_move_info || null, // ข้อมูลรายละเอียดท่าจากตาราง move

        pattern_list: row.pattern_list ?? []
      };

      if (group) {
        group.monsters.push(monsterData);
      } else {
        acc.push({
          distance: dist,
          monsters: [monsterData]
        });
      }

      return acc;
    }, []);

    // 6️⃣ Response
    return res.status(200).json({
      ...stageData,
      events: groupedEvents
    });

  } catch (error) {
    console.error("getStageEvents Error:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
}

// ==============================
// STAGE CRUD
// ==============================

// GET /stage/:id
export async function getStageById(req, res) {
  try {
    const { id } = req.params;
    const r = await database.query("SELECT * FROM stage WHERE id=$1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: "stage not found" });
    return res.status(200).json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// POST /stage
export async function createStage(req, res) {
  try {
    const { id, orderNo, name, description, money_reward, distant_goal } = req.body;

    await database.query(
      `
      INSERT INTO stage (id, "orderNo", name, description, money_reward, distant_goal)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        id,
        Number(orderNo),
        name,
        description ?? null,
        money_reward === "" || money_reward == null ? null : Number(money_reward),
        distant_goal === "" || distant_goal == null ? null : Number(distant_goal),
      ]
    );

    return res.status(201).json({ message: "stage created" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT /stage/:id
export async function updateStage(req, res) {
  try {
    const { id } = req.params;
    const { orderNo, name, description, money_reward, distant_goal } = req.body;

    const r = await database.query(
      `
      UPDATE stage SET
        "orderNo"=$1,
        name=$2,
        description=$3,
        money_reward=$4,
        distant_goal=$5
      WHERE id=$6
      `,
      [
        Number(orderNo),
        name,
        description ?? null,
        money_reward === "" || money_reward == null ? null : Number(money_reward),
        distant_goal === "" || distant_goal == null ? null : Number(distant_goal),
        id,
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ message: "stage not found" });
    return res.status(200).json({ message: "stage updated" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// DELETE /stage/:id  (ลบ spawn ก่อน กัน FK + ลบ map ถ้ามี)
export async function deleteStage(req, res) {
  try {
    const { id } = req.params;

    await database.query("DELETE FROM monster_spawn WHERE stage_id=$1", [id]);

    const r = await database.query("DELETE FROM stage WHERE id=$1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: "stage not found" });

    // ลบไฟล์ map ถ้ามี
    const filePath = path.join(process.cwd(), "img_map", `${id}.png`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.status(200).json({ message: "stage deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ==============================
// ✅ MAP UPLOAD / DELETE
// ==============================

// POST /stage/:id/map
export async function uploadStageMap(req, res) {
  try {
    const { id } = req.params;

    const r = await database.query("SELECT id FROM stage WHERE id=$1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: "stage not found" });

    if (!req.file) return res.status(400).json({ message: "missing file field: map" });

    return res.status(200).json({
      message: "map uploaded",
      filename: req.file.filename,
      url: `/img_map/${req.file.filename}`,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// DELETE /stage/:id/map
export async function deleteStageMap(req, res) {
  try {
    const { id } = req.params;

    const filePath = path.join(process.cwd(), "img_map", `${id}.png`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "map not found" });
    }

    fs.unlinkSync(filePath);
    return res.status(200).json({ message: "map deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// =====================================================
// ✅ SPAWN (monster_spawn) — CRUD
// =====================================================

// GET /spawn?stage_id=xxx
export async function getSpawns(req, res) {
  try {
    const { stage_id } = req.query;

    if (!stage_id) {
      const r = await database.query("SELECT * FROM monster_spawn ORDER BY id ASC");
      return res.status(200).json(r.rows);
    }

    const r = await database.query(
      "SELECT * FROM monster_spawn WHERE stage_id=$1 ORDER BY distant_spawn ASC",
      [stage_id]
    );
    return res.status(200).json(r.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// POST /spawn
export async function createSpawn(req, res) {
  try {
    const { stage_id, monster_id, level, distant_spawn } = req.body;

    const r = await database.query(
      `
      INSERT INTO monster_spawn (stage_id, monster_id, level, distant_spawn)
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [stage_id, monster_id, level, Number(distant_spawn)]
    );

    return res.status(201).json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT /spawn/:id
export async function updateSpawn(req, res) {
  try {
    const { id } = req.params;
    const { stage_id, monster_id, level, distant_spawn } = req.body;

    const r = await database.query(
      `
      UPDATE monster_spawn SET
        stage_id=$1,
        monster_id=$2,
        level=$3,
        distant_spawn=$4
      WHERE id=$5
      RETURNING *
      `,
      [stage_id, monster_id, level, Number(distant_spawn), id]
    );

    if (r.rowCount === 0) return res.status(404).json({ message: "spawn not found" });
    return res.status(200).json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// DELETE /spawn/:id
export async function deleteSpawn(req, res) {
  try {
    const { id } = req.params;
    const r = await database.query("DELETE FROM monster_spawn WHERE id=$1", [id]);

    if (r.rowCount === 0) return res.status(404).json({ message: "spawn not found" });
    return res.status(200).json({ message: "spawn deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
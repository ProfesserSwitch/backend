import database from "../service/database.js";

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

export async function getStageEvents(req, res) 
{
    const { id } = req.params;
    console.log(`GET / Stage Events with Monster Data & Patterns (No Def) for Stage ID: ${id}`);

    try {
      const query = `
        SELECT 
          -- 1. ข้อมูล Event
          se.id AS event_id,
          se.stage_id,
          se.distant_spawn,
          se.level AS spawn_level, -- เปลี่ยนชื่อกันสับสนกับ level ของ monster (ถ้ามี)

          -- 2. ข้อมูล Monster ทั้งหมด (ใช้ m.*)
          m.*,

          -- 3. ข้อมูล Monster Pattern (เก็บไว้ตามเดิม)
          (
            SELECT json_agg(
              json_build_object(
                'pattern_no', mp.pattern_no,
                'order', mp.pattern_order,
                'move', mp.pattern_move
              ) ORDER BY mp.pattern_no ASC, mp.pattern_order ASC
            )
            FROM monster_move mp
            WHERE mp.monster_id = m.id
          ) AS pattern_list

        FROM monster_spawn se
        JOIN monster m ON se.monster_id = m.id
        WHERE se.stage_id = $1
        ORDER BY se.distant_spawn ASC
      `;

      const result = await database.query(query, [id]);

      return res.status(200).json(result.rows);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    } 
}

// ==============================
// STAGE CRUD (MAP CRUD)
// ==============================

// ✅ GET /stage/:id
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

// ✅ POST /stage
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

// ✅ PUT /stage/:id
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

// ✅ DELETE /stage/:id  (ลบ spawn ก่อน กัน FK)
export async function deleteStage(req, res) {
  try {
    const { id } = req.params;

    await database.query("DELETE FROM monster_spawn WHERE stage_id=$1", [id]);

    const r = await database.query("DELETE FROM stage WHERE id=$1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: "stage not found" });

    return res.status(200).json({ message: "stage deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// =====================================================
// ✅ SPAWN (วางมอนสเตอร์ในด่าน) — CRUD
// table: monster_spawn(id, stage_id, monster_id, level, distant_spawn)
// =====================================================

// ✅ GET /spawn?stage_id=xxx
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

// ✅ POST /spawn
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

// ✅ PUT /spawn/:id
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

// ✅ DELETE /spawn/:id
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
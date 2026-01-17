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

    // 2️⃣ ดึง Monster Spawn + Monster + Move Pattern
    const query = `
      SELECT
        se.id              AS spawn_id,
        se.stage_id,
        se.distant_spawn,

        m.id               AS monster_id,
        m.name,
        m.description,
        m.max_hp,
        m.atk_power_min,
        m.atk_power_max,
        m.armor,
        m.exp,
        m.speed,
        m."isBoss",

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

    // 3️⃣ Group ตามระยะ spawn
    const groupedEvents = eventResult.rows.reduce((acc, row) => {
      const dist = Number(row.distant_spawn);

      let group = acc.find(g => g.distance === dist);

      const monsterData = {
        spawn_id: row.spawn_id,
        monster_id: row.monster_id,
        name: row.name,
        description: row.description,
        max_hp: row.max_hp,
        atk_power_min: row.atk_power_min,
        atk_power_max: row.atk_power_max,
        armor: row.armor,
        exp: row.exp,
        speed: row.speed,
        isBoss: row.isBoss,
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

    // 4️⃣ Response
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
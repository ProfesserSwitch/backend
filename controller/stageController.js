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
    console.log(`GET / Stage Events with Monster Defs for Stage ID: ${id}`);

    try {
      const query = `
        SELECT 
          -- 1. ข้อมูล Event
          se.id AS event_id,
          se.stage_id,
          se.wave_no,
          se.level,

          -- 2. ข้อมูล Monster
          m.id AS monster_id,
          m.name,
          m.max_hp,
          m.atk_power_min,
          m.atk_power_max,
          m.cooldown,

          -- 3. ข้อมูล Monster Def (ดึงเป็น Array JSON)
          (
            SELECT json_agg(
              json_build_object(
                'alphabet', md.alphabet, 
                'multiplier', md.multiplier
              )
            )
            FROM monster_def md
            WHERE md.monster_id = m.id
          ) AS weakness_list

        FROM stage_event se
        JOIN monster m ON se.monster_id = m.id
        WHERE se.stage_id = $1
        ORDER BY se.wave_no ASC
      `;

      const result = await database.query(query, [id]);

      return res.status(200).json(result.rows);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    } 
}
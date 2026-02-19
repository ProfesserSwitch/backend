import database from "../service/database.js";

export async function getDict(req, res) 
{
    console.log(`GET / Dict is Requested`);
    try {
      const result = await database.query('SELECT word, type, meaning, level FROM dictionary');
      return res.status(200).json(result.rows);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }   
}

export async function searchDict(req, res) {
  console.log(`GET / searchDict is Requested`);
    const q = req.params.word;

    console.log(`Searching for word starting with: ${q}`);
    try {
        const result = await database.query(
            "SELECT * FROM dictionary WHERE word ILIKE $1 LIMIT 10",
            [`${q}%`] 
        );
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export async function postDict(req, res) 
{
  console.log(`POST / Dict is Requested`);

  try {
    // 1. รับค่า id และ is_oxford เพิ่มเข้ามา
    const { id, word, type, meaning, level, is_oxford } = req.body;

    // validate
    // หมายเหตุ: เอา !level ออก เพราะ level เราสามารถเป็นค่าว่าง ("") ได้
    // และเช็ค is_oxford ว่ามีการส่ง boolean มาจริงๆ ใช่ไหม
    if (!id || !word || !type || !meaning || typeof is_oxford !== 'boolean') {
      console.log("Invalid data");
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    // insert (เพิ่ม id, level, is_oxford เข้าไปใน Query)
    const result = await database.query(
      `
        INSERT INTO dictionary (id, word, type, meaning, level, is_oxford)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [id, word, type, meaning, level, is_oxford]
    );

    console.log(`Word '${word}' registered successfully`);
    // ส่งเฉพาะข้อมูลที่ควรส่ง
    return res.json({
      isSuccess: true,
      message: "word added successfully", // แก้จาก "server error" เป็นข้อความสำเร็จ
      data: result.rows[0],
    });

  } catch (err) {
    console.error(err);
    
    // ดัก Error เผื่อกรณีคีย์ซ้ำ (id ซ้ำ) ที่เราป้องกันไว้ในตาราง
    if (err.code === '23505') { 
      return res.status(409).json({
        isSuccess: false,
        message: "word and type already exist",
      });
    }

    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}

export async function getDictByLetter(req, res) {
  console.log("GET /dict/letter");

  const { letter } = req.params;

  if (!letter || letter.length !== 1) {
    return res.status(400).json({
      isSuccess: false,
      message: "letter must be 1 character",
    });
  }

  try {
    const result = await database.query(
      `
      SELECT word, type, meaning, level
      FROM dictionary
      WHERE word ILIKE $1
      ORDER BY word ASC
      `,
      [`${letter}%`]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" });
  }
}


export async function updateDict(req, res) {
  console.log("PUT /dict");

  const { word } = req.params;
  const { type, meaning, level } = req.body;

  // ✅ level เป็น string ("A1","A2","B1","B2") ตามที่หน้า Admin ส่งมา
  if (!word || !type || !meaning || !level) {
    return res.status(400).json({
      isSuccess: false,
      message: "invalid data",
    });
  }

  // ✅ กันค่าหลุด
  const allowedLevels = new Set(["A1", "A2", "B1", "B2"]);
  if (!allowedLevels.has(String(level).trim())) {
    return res.status(400).json({
      isSuccess: false,
      message: "invalid level",
    });
  }

  try {
    const result = await database.query(
      `
      UPDATE dictionary
      SET type = $1,
          meaning = $2,
          level = $3
      WHERE word = $4
      RETURNING word, type, meaning, level
      `,
      [String(type).trim(), String(meaning).trim(), String(level).trim(), word]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        isSuccess: false,
        message: "word not found",
      });
    }

    return res.json({
      isSuccess: true,
      message: "updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" });
  }
}


export async function deleteDict(req, res) {
  console.log("DELETE /dict");

  const { word } = req.params;

  if (!word) {
    return res.status(400).json({
      isSuccess: false,
      message: "word is required",
    });
  }

  try {
    const result = await database.query(
      `
      DELETE FROM dictionary
      WHERE word = $1
      RETURNING word
      `,
      [word]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        isSuccess: false,
        message: "word not found",
      });
    }

    return res.json({
      isSuccess: true,
      message: "deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" });
  }
}

export async function queryDict(req, res) {
  console.log("POST /dict/query");

  const {
    startsWith,
    contains,
    length = 0,
    level = null,
    limit = 50,
    lastWord, // ⭐ cursor
  } = req.body;

  let conditions = [];
  let values = [];
  let idx = 1;

  /* ---------- WORD FILTER ---------- */
  if (startsWith && contains) {
    conditions.push(`word ILIKE $${idx++}`);
    values.push(`${startsWith}${contains}%`);
  } else if (startsWith) {
    conditions.push(`word ILIKE $${idx++}`);
    values.push(`${startsWith}%`);
  } else if (contains) {
    conditions.push(`word ILIKE $${idx++}`);
    values.push(`${contains}%`);
  }

  /* ---------- CURSOR ---------- */
  if (lastWord) {
    conditions.push(`word > $${idx++}`);
    values.push(lastWord);
  }

  /* ---------- LENGTH ---------- */
  if (length > 0) {
    conditions.push(`LENGTH(word) = $${idx++}`);
    values.push(length);
  }

  /* ---------- LEVEL ---------- */
  if (level !== null) {
    conditions.push(`level = $${idx++}`);
    values.push(level);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const sql = `
    SELECT word, type, meaning, level
    FROM dictionary
    ${whereClause}
    ORDER BY word ASC
    LIMIT $${idx}
  `;

  values.push(limit + 1);

  try {
    const result = await database.query(sql, values);

    const hasNext = result.rows.length > limit;
    const data = hasNext ? result.rows.slice(0, limit) : result.rows;

    return res.json({
      isSuccess: true,
      count: data.length,
      hasNext,
      data,
      lastWord: data.length ? data[data.length - 1].word : null, // ⭐ ส่งกลับ
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      isSuccess: false,
      message: "server error",
    });
  }
}
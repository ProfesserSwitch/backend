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
    const { word, type, meaning, level } = req.body;

    // validate
    if (!word || !type || !meaning || !level) {
      console.log("Invalid data");
      return res.status(400).json({
        isSuccess: false,
        message: "invalid data",
      });
    }

    // insert (ไม่ต้องใส่ id / created_at)
    const result = await database.query(
      `
        INSERT INTO dictionary (word, type, meaning, level)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [word, type, meaning, level]
    );

    console.log("Player registered successfully");
    // ส่งเฉพาะข้อมูลที่ควรส่ง
    return res.json({
      isSuccess: true,
      message: "server error",
      data: result.rows[0],
    });

  } catch (err) {
    console.error(err);
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

  if (!word || !type || !meaning || typeof level !== "number") {
    return res.status(400).json({
      isSuccess: false,
      message: "invalid data",
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
      [type.trim(), meaning.trim(), level, word]
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
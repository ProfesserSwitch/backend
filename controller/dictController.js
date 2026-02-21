import database from "../service/database.js";

/** ---------- Helpers ---------- **/
function slugWord(input = "") {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeType(input = "") {
  return String(input).trim().toLowerCase();
}

/** ✅ level: allow A1/A2/B1/B2 OR NULL */
function normalizeLevel(level) {
  if (level === "" || level === undefined || level === null) return null;

  const cleaned = String(level).trim();
  const allowed = new Set(["A1", "A2", "B1", "B2"]);
  if (!allowed.has(cleaned)) return "__INVALID__";
  return cleaned;
}

async function generateUniqueId(word, type) {
  const base = `${slugWord(word)}_${normalizeType(type)}`;
  if (!base || base === "_") return null;

  let candidate = base;
  let n = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await database.query(`SELECT 1 FROM dictionary WHERE id = $1 LIMIT 1`, [candidate]);
    if (exists.rowCount === 0) return candidate;
    candidate = `${base}_${n++}`;
  }
}

async function generateUniqueIdExcludeCurrent(word, type, currentId) {
  const base = `${slugWord(word)}_${normalizeType(type)}`;
  if (!base || base === "_") return null;

  let candidate = base;
  let n = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await database.query(
      `SELECT 1 FROM dictionary WHERE id = $1 AND id <> $2 LIMIT 1`,
      [candidate, currentId]
    );
    if (exists.rowCount === 0) return candidate;
    candidate = `${base}_${n++}`;
  }
}

/** ---------- Controllers ---------- **/
export async function getDict(req, res) {
  try {
    const result = await database.query(
      `SELECT id, word, type, meaning, level, is_oxford FROM dictionary`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function searchDict(req, res) {
  const q = req.params.word;
  try {
    const result = await database.query(
      `SELECT id, word, type, meaning, level, is_oxford
       FROM dictionary
       WHERE word ILIKE $1
       ORDER BY word ASC
       LIMIT 10`,
      [`${q}%`]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getDictByLetter(req, res) {
  const { letter } = req.params;
  if (!letter || letter.length !== 1) {
    return res.status(400).json({ isSuccess: false, message: "letter must be 1 character" });
  }

  try {
    const result = await database.query(
      `
      SELECT id, word, type, meaning, level, is_oxford
      FROM dictionary
      WHERE word ILIKE $1
      ORDER BY word ASC
      `,
      [`${letter}%`]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "server error" });
  }
}

export async function postDict(req, res) {
  try {
    const { word, type, meaning, level, is_oxford } = req.body;

    if (!word || !type || !meaning) {
      return res.status(400).json({ isSuccess: false, message: "invalid data (word, type, meaning are required)" });
    }

    const lv = normalizeLevel(level);
    if (lv === "__INVALID__") {
      return res.status(400).json({ isSuccess: false, message: "invalid level" });
    }

    const generatedId = await generateUniqueId(word, type);
    if (!generatedId) {
      return res.status(400).json({ isSuccess: false, message: "cannot generate id (check word/type)" });
    }

    const oxfordFlag = typeof is_oxford === "boolean" ? is_oxford : false;

    const result = await database.query(
      `
        INSERT INTO dictionary (id, word, type, meaning, level, is_oxford)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, word, type, meaning, level, is_oxford
      `,
      [
        generatedId,
        String(word).trim(),
        normalizeType(type),
        String(meaning).trim(),
        lv, // ✅ NULL ได้
        oxfordFlag,
      ]
    );

    return res.json({ isSuccess: true, message: "word added successfully", data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ isSuccess: false, message: "duplicate id" });
    }
    return res.status(500).json({ isSuccess: false, message: "server error" });
  }
}

export async function updateDict(req, res) {
  const { id } = req.params;
  const { word, type, meaning, level, is_oxford } = req.body;

  if (!id) return res.status(400).json({ isSuccess: false, message: "id is required" });

  if (
    word === undefined &&
    type === undefined &&
    meaning === undefined &&
    level === undefined &&
    is_oxford === undefined
  ) {
    return res.status(400).json({ isSuccess: false, message: "no fields to update" });
  }

  try {
    const current = await database.query(
      `SELECT id, word, type, meaning, level, is_oxford FROM dictionary WHERE id = $1`,
      [id]
    );
    if (current.rowCount === 0) return res.status(404).json({ isSuccess: false, message: "not found" });

    const cur = current.rows[0];

    const nextWord = word === undefined ? cur.word : String(word).trim();
    const nextType = type === undefined ? cur.type : normalizeType(type);
    const nextMeaning = meaning === undefined ? cur.meaning : String(meaning).trim();
    const nextOxford = is_oxford === undefined ? cur.is_oxford : Boolean(is_oxford);

    // ✅ normalize level (NULL ได้)
    let nextLevel = cur.level;
    if (level !== undefined) {
      const lv = normalizeLevel(level);
      if (lv === "__INVALID__") {
        return res.status(400).json({ isSuccess: false, message: "invalid level" });
      }
      nextLevel = lv; // null หรือ A1/A2/B1/B2
    }

    // ถ้า word/type เปลี่ยน -> regen id
    let nextId = cur.id;
    if (nextWord !== cur.word || nextType !== cur.type) {
      nextId = await generateUniqueIdExcludeCurrent(nextWord, nextType, cur.id);
      if (!nextId) return res.status(400).json({ isSuccess: false, message: "cannot generate new id" });
    }

    const updated = await database.query(
      `
      UPDATE dictionary
      SET id = $1,
          word = $2,
          type = $3,
          meaning = $4,
          level = $5,
          is_oxford = $6
      WHERE id = $7
      RETURNING id, word, type, meaning, level, is_oxford
      `,
      [nextId, nextWord, nextType, nextMeaning, nextLevel, nextOxford, cur.id]
    );

    return res.json({ isSuccess: true, message: "updated successfully", data: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({ isSuccess: false, message: "server error" });
  }
}

export async function deleteDict(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ isSuccess: false, message: "id is required" });

  try {
    const result = await database.query(
      `DELETE FROM dictionary WHERE id = $1 RETURNING id, word`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ isSuccess: false, message: "not found" });
    return res.json({ isSuccess: true, message: "deleted successfully", data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ isSuccess: false, message: "server error" });
  }
}

export async function queryDict(req, res) {
  const { startsWith, contains, length = 0, level = null, limit = 50, lastWord } = req.body;

  let conditions = [];
  let values = [];
  let idx = 1;

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

  if (lastWord) {
    conditions.push(`word > $${idx++}`);
    values.push(lastWord);
  }

  if (length > 0) {
    conditions.push(`LENGTH(word) = $${idx++}`);
    values.push(length);
  }

  // ✅ ถ้าส่ง level เป็น "A1/A2/B1/B2" ค่อย filter
  if (level !== null && level !== "" && level !== undefined) {
    const lv = normalizeLevel(level);
    if (lv === "__INVALID__") {
      return res.status(400).json({ isSuccess: false, message: "invalid level" });
    }
    conditions.push(`level = $${idx++}`);
    values.push(lv);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT id, word, type, meaning, level, is_oxford
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
      lastWord: data.length ? data[data.length - 1].word : null,
    });
  } catch (error) {
    return res.status(500).json({ isSuccess: false, message: "server error" });
  }
}
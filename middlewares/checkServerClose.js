import database from "../service/database.js";

export async function checkServerClose(req, res, next) {
  try {
    const result = await database.query(
      `
      SELECT is_close
      FROM server
      WHERE id = $1
      `,
      ["hell"]
    );

    if (result.rowCount === 0) {
      return res.status(500).json({ message: "server config not found" });
    }

    console.log(result.rows);

    const { is_close } = result.rows[0]; // postgres จะ lowercase

    console.log(is_close);

    if (!is_close) {
      return res.status(403).json({
        message: "server is open, cannot modify data"
      });
    }

    next(); // ผ่าน ถึงจะไปทำ CRUD ต่อ
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

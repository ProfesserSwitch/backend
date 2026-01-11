import database from "../service/database.js";

export async function getHero(req, res) {
  console.log(`GET / Hero is Requested`);
  try {
    const result = await database.query("SELECT * FROM hero");
    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
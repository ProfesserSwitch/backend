import database from "../service/database.js";

export async function getShop(req, res) {
  console.log(`GET / shop is Requested`);
  try {
    const result = await database.query(`
      SELECT 
        shop.id AS shop_id,
        shop.price,
        item.id AS item_id,
        item.name,
        item.type,
        item.descriptionn
      FROM shop
      JOIN item ON shop.item_id = item.id
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function searchShop(req, res) {
  console.log(`GET / searchShop is Requested`);
  const search = req.params.name;

  try {
    const result = await database.query(`
      SELECT 
        shop.id AS shop_id,
        shop.price,
        item.id AS item_id,
        item.name,
        item.type,
        item.description
      FROM shop
      JOIN item ON shop.item_id = item.id
      WHERE item.name ILIKE $1
    `, [`${search}%`]);

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


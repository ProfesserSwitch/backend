import jwt from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // 1. ไม่มี header
  if (!authHeader) {
    return res.status(401).json({ message: "no token" });
  }

  // 2. แยก Bearer token
  const token = authHeader.split(" ")[1];

  try {
    // 3. ตรวจ JWT
    const decoded = jwt.verify(token, "ImGroot");

    // 4. เก็บ user ไว้ใช้ต่อ
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({ message: "invalid token" });
  }
}

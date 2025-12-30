import pkg from "pg"; //connect to database

const {Pool} = pkg; // สร้างตัวแปร ของ PostgreSQ

// เชื่อมต่อกับ Database Server
export default  new Pool({
  connectionString:`postgres://dev:${encodeURIComponent('8264')}@127.0.0.1:5432/WordGame`
});
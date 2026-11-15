import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function text(value, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, `Texto obrigatório (até ${max} caracteres).`);
  return value.trim();
}
export function id(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    fail(400, "Identificador inválido.");
  return value;
}
export function pair(a, b) {
  id(a);
  id(b);
  if (a === b) fail(400, "Escolha outra pessoa.");
  return [a, b].sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1)).join(":");
}
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    fail(400, "A senha deve ter entre 10 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function checkPassword(password, hash) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

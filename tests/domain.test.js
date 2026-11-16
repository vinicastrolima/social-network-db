import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPassword,
  hashPassword,
  id,
  pair,
  text,
} from "../server/domain.js";

test("normaliza pares sem perder precisão BIGINT", () => {
  assert.equal(pair("2", "9007199254740993"), "2:9007199254740993");
  assert.equal(id("9223372036854775807"), "9223372036854775807");
  for (const value of [1, null, "0", "-1", "1x", " 1", "01"])
    assert.throws(
      () => id(value),
      (e) => e.status === 400 && e.message.length > 0,
    );
  assert.throws(() => pair("x", "2"));
  assert.throws(() => pair("2", "x"));
  assert.equal(pair("9007199254740993", "2"), "2:9007199254740993");
  assert.throws(() => pair("2", "2"));
  assert.throws(() => id("9223372036854775808"));
});
test("recusa conteúdo vazio e maior que o limite", () => {
  assert.throws(
    () => text(null),
    (e) => e.status === 400,
  );
  assert.equal(text("12", 2), "12");
  assert.throws(() => text(" "));
  assert.throws(() => text("123", 2));
  assert.equal(text(" oi "), "oi");
});
test("senhas usam salt exclusivo e verificam sem armazenar texto puro", async () => {
  const p = "test-password-123";
  const a = await hashPassword(p);
  const b = await hashPassword(p);
  assert.notEqual(a, b);
  assert.ok(!a.includes(p));
  assert.ok(await checkPassword(p, a));
  assert.equal(await checkPassword("wrong", a), false);
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword(null), (e) => e.status === 400);
  await assert.rejects(hashPassword("x".repeat(129)), (e) => e.status === 400);
  for (const password of ["x".repeat(10), "x".repeat(128)])
    assert.equal(
      await checkPassword(password, await hashPassword(password)),
      true,
    );
  assert.equal(await checkPassword(null, a), false);
  assert.equal(await checkPassword("x".repeat(129), a), false);
  assert.equal(await checkPassword(p, "salt:"), false);
  assert.equal(await checkPassword(p, ":abc"), false);
  assert.equal(await checkPassword(p, "salt:ab"), false);
});

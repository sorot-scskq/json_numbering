// JSONナンバリング（json_numbering_ver2.html）の出力・読込のテスト
// 実行: node --test test/*.test.js
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// HTMLから画面に依存しない処理（<script id="core">）だけを取り出して読み込む
const html = readText("json_numbering_ver2.html");
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/);
assert.ok(core, '<script id="core"> が見つかりません');
vm.runInThisContext(core[1], { filename: "json_numbering_ver2.html#core" });
const C = globalThis.JsonNumberingCore;

const OPTS = { defaultSno: 99, startCno: 1, escape: false };
// BOM・改行コード・末尾の改行の違いを無視して比べる
const norm = (s) => s.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
// 出力JSONから [SNO, CNO, PRVSNO, PRVCNO] だけを取り出す
const chain = (json) => JSON.parse(json).map((o) => [o.SNO, o.CNO, o.PRVSNO, o.PRVCNO]);

// 表の1行を列名で作る
function row(values) {
  const r = C.blankRow();
  for (const [k, v] of Object.entries(values)) r[C.CI[k]] = String(v);
  return r;
}
// command.json の1件を作る
function item(sno, cno, prvsno, prvcno, comment = "c" + cno) {
  return {
    Comment: comment, SNO: sno, CNO: cno, PRVSNO: prvsno, PRVCNO: prvcno,
    RunInfo: { FUNCNO: 2, FWD: 100, TRN: 0, KP: 3.6, KI: 0, KD: 100, NOBLNCE: 1 },
    SwitchInfo: { SCJFN: 128, SCT: 0, SCD: 480, SCR: 0, SCC: 0, SCV: 0, SCX: 0, SCY: 0 },
    CoordCorrectInfo: {},
  };
}
// JSONを読み込んで、そのまま出力する
function roundTrip(text) {
  const res = C.parseJson(text);
  return C.buildJson(res.rows, { ...OPTS, startCno: res.startCno ?? 1 });
}

describe("command.json の読込と出力", () => {
  const original = readText("右コース/右完走.txt");

  test("右完走.txt を読み込んで出力すると元のファイルと一致する", () => {
    const res = C.parseJson(original);
    assert.equal(res.rows.length, 43);
    assert.equal(res.prvMismatch, 0);
    assert.equal(res.trailingBlank, 0);
    assert.equal(norm(roundTrip(original)), norm(original));
  });

  test("SCRIPT・JMPSNO を含むファイル（fixtures/command_sno_routes.json）を読み込んで出力すると一致する", () => {
    const text = readText("test/fixtures/command_sno_routes.json");
    const res = C.parseJson(text);
    assert.equal(res.rows.length, 73);
    assert.equal(res.prvMismatch, 0);
    assert.equal(res.trailingBlank, 0);
    assert.deepEqual(res.unknownKeys, []);
    assert.equal(norm(roundTrip(text)), norm(text));
  });

  test("SCRIPT・JMPSNO は値のある行だけ、SCRIPTはRunInfoの先頭・JMPSNOはSwitchInfoの末尾に出力する", () => {
    const a = item(1, 1, 1, 0), b = item(1, 2, 1, 1);
    b.RunInfo = { SCRIPT: 'dir\\a "b".py', ...b.RunInfo };
    b.SwitchInfo.JMPSNO = 22;
    const out = JSON.parse(roundTrip(JSON.stringify([a, b])));
    assert.deepEqual(Object.keys(out[0].RunInfo), ["FUNCNO", "FWD", "TRN", "KP", "KI", "KD", "NOBLNCE"]);
    assert.deepEqual(Object.keys(out[0].SwitchInfo), ["SCJFN", "SCT", "SCD", "SCR", "SCC", "SCV", "SCX", "SCY"]);
    assert.equal(Object.keys(out[1].RunInfo)[0], "SCRIPT");
    assert.equal(out[1].RunInfo.SCRIPT, 'dir\\a "b".py');
    assert.equal(Object.keys(out[1].SwitchInfo).at(-1), "JMPSNO");
    assert.equal(out[1].SwitchInfo.JMPSNO, 22);
  });

  test("画面に無い項目は unknownKeys で返す", () => {
    const o = item(1, 1, 1, 0);
    o.EXTRA = 1;
    o.RunInfo.SPEED = 3;
    assert.deepEqual(C.parseJson(JSON.stringify([o])).unknownKeys, ["EXTRA", "RunInfo.SPEED"]);
  });

  test("出力の改行コードはCRLF", () => {
    assert.doesNotMatch(roundTrip(original), /[^\r]\n/);
  });

  for (const indent of [2, 4]) {
    test(`整形されたJSON（インデント${indent}・CRLF・BOM付き）でも同じ出力になる`, () => {
      const pretty = "\uFEFF" + JSON.stringify(JSON.parse(original), null, indent).replace(/\n/g, "\r\n") + "\r\n";
      assert.equal(norm(roundTrip(pretty)), norm(original));
    });
  }

  test("CNOは読み込んだ値のまま（SNOごとに1から振っているファイル）", () => {
    const list = [item(1, 1, 1, 0), item(1, 2, 1, 1), item(1, 3, 1, 2), item(2, 1, 1, 3), item(2, 2, 2, 1)];
    const text = JSON.stringify(list, null, 2);
    assert.equal(C.parseJson(text).prvMismatch, 0);
    assert.deepEqual(chain(roundTrip(text)), list.map((o) => [o.SNO, o.CNO, o.PRVSNO, o.PRVCNO]));
  });

  test("CNOが連番でなくても振り直さない", () => {
    const list = [item(5, 10, 5, 9), item(5, 20, 5, 10), item(5, 21, 5, 20), item(5, 3, 5, 21)];
    assert.deepEqual(chain(roundTrip(JSON.stringify(list))), list.map((o) => [o.SNO, o.CNO, o.PRVSNO, o.PRVCNO]));
  });

  test("PRVSNO・PRVCNOが前の行と合わない件数を数え、出力は前の行から計算する", () => {
    const list = [item(1, 1, 1, 0), item(1, 2, 9, 9), item(1, 3, 1, 2)];
    assert.equal(C.parseJson(JSON.stringify(list)).prvMismatch, 1);
    assert.deepEqual(chain(roundTrip(JSON.stringify(list))), [[1, 1, 1, 0], [1, 2, 1, 1], [1, 3, 1, 2]]);
  });

  test("ファイルに無い項目は 0 で出力する", () => {
    const o = item(1, 1, 1, 0);
    delete o.RunInfo.KP; delete o.RunInfo.KI; delete o.RunInfo.KD;
    delete o.SwitchInfo;
    const out = JSON.parse(roundTrip(JSON.stringify([o])))[0];
    assert.deepEqual(out.RunInfo, { FUNCNO: 2, FWD: 100, TRN: 0, KP: 0, KI: 0, KD: 0, NOBLNCE: 1 });
    assert.deepEqual(out.SwitchInfo, { SCJFN: 0, SCT: 0, SCD: 0, SCR: 0, SCC: 0, SCV: 0, SCX: 0, SCY: 0 });
  });

  test("CoordCorrectInfo は値があれば出力し、{} なら {} のまま", () => {
    const a = item(1, 1, 1, 0), b = item(1, 2, 1, 1);
    b.CoordCorrectInfo = { ACAF: 7, CAPX: 100, CAPY: -50, CAPR: 90 };
    const out = JSON.parse(roundTrip(JSON.stringify([a, b])));
    assert.deepEqual(out[0].CoordCorrectInfo, {});
    assert.deepEqual(out[1].CoordCorrectInfo, b.CoordCorrectInfo);
  });

  test("末尾のCommentが空で出力されない件数を返す", () => {
    const list = [item(1, 1, 1, 0), item(1, 2, 1, 1, ""), item(1, 3, 1, 2, "")];
    assert.equal(C.parseJson(JSON.stringify(list)).trailingBlank, 2);
  });

  test("壊れたJSON・配列でないJSONは例外になる", () => {
    assert.throws(() => C.parseJson('[{"Comment":'));
    assert.throws(() => C.parseJson('{"Comment":"a"}'), /配列/);
  });

  test("先頭が [ のファイルだけJSONとして扱う", () => {
    assert.equal(C.isJson("\uFEFF  \r\n[ ]"), true);
    assert.equal(C.isJson("Comment\tFUNCNO"), false);
    assert.equal(C.isJson('{"a":1}'), false);
  });
});

describe("表からの出力", () => {
  test("CNOが空欄の行は前の行＋1（先頭行はCNO開始番号）", () => {
    const rows = [row({ Comment: "a" }), row({ Comment: "b", CNO: 50 }), row({ Comment: "c" }), row({ Comment: "d" })];
    assert.deepEqual(chain(C.buildJson(rows, { ...OPTS, startCno: 10 })),
      [[99, 10, 99, 9], [99, 50, 99, 10], [99, 51, 99, 50], [99, 52, 99, 51]]);
  });

  test("SNOが空欄の行はSNO既定値、PRVSNOは前の行のSNO", () => {
    const rows = [row({ Comment: "a" }), row({ Comment: "b", SNO: 5 }), row({ Comment: "c" })];
    assert.deepEqual(chain(C.buildJson(rows, { ...OPTS, defaultSno: 7 })),
      [[7, 1, 7, 0], [5, 2, 7, 1], [7, 3, 5, 2]]);
  });

  test("出力はCommentが入っている最後の行まで。途中の空Commentは出力する", () => {
    const rows = [row({ Comment: "a" }), row({ FUNCNO: 1 }), row({ Comment: "c" }), row({ FUNCNO: 5 })];
    assert.deepEqual(JSON.parse(C.buildJson(rows, OPTS)).map((o) => o.Comment), ["a", "", "c"]);
  });

  test("Commentが1行も無ければ空の配列", () => {
    assert.deepEqual(JSON.parse(C.buildJson([row({ FUNCNO: 1 })], OPTS)), []);
  });

  test("「Commentをエスケープ」で \" と \\ を含むCommentもJSONとして読める", () => {
    const comment = '前進 "速い" C:\\tmp';
    const rows = [row({ Comment: comment })];
    assert.throws(() => JSON.parse(C.buildJson(rows, OPTS)));
    assert.equal(JSON.parse(C.buildJson(rows, { ...OPTS, escape: true }))[0].Comment, comment);
  });

  test("SNO・CNOの組の重複を見つける", () => {
    const rows = [row({ Comment: "a", CNO: 1 }), row({ Comment: "b", CNO: 1 }), row({ Comment: "c", SNO: 2, CNO: 1 })];
    assert.deepEqual(C.duplicates(C.resolve(rows, OPTS)), ["SNO 99 CNO 1"]);
  });
});

describe("TSV/CSV の読込と保存", () => {
  test("右完走json.txt（SNO・CNO列の無い旧形式）を読み込み、右完走.txt と同じ内容で出力する", () => {
    const rows = C.parseTable(readText("右コース/右完走json.txt"));
    assert.equal(rows.length, 43);
    assert.equal(rows[0][C.CI.Comment], "LAPゲートまで進む");
    assert.equal(rows[0][C.CI.SNO], "");
    assert.equal(rows[0][C.CI.CNO], "");
    // TSVの一部の行は ACAF に 0 が入っていて右完走.txt と異なるため、CoordCorrectInfo 以外を比べる
    const pick = ({ Comment, SNO, CNO, PRVSNO, PRVCNO, RunInfo, SwitchInfo }) =>
      ({ Comment, SNO, CNO, PRVSNO, PRVCNO, RunInfo, SwitchInfo });
    const expected = JSON.parse(readText("右コース/右完走.txt").replace(/^\uFEFF/, ""));
    assert.deepEqual(JSON.parse(C.buildJson(rows, OPTS)).map(pick), expected.map(pick));
  });

  test("入力を保存（TSV）した内容を読み込むと元の表に戻る", () => {
    const rows = [row({ SNO: 3, CNO: 7, Comment: "a", FUNCNO: 2, KP: 3.6, SCRIPT: "x.py" }), row({ Comment: "b", ACAF: 1, JMPSNO: 29 })];
    assert.deepEqual(C.parseTable(C.toTsv(rows)), rows);
  });

  test("見出し付きCSVも列名で読み込める", () => {
    const rows = C.parseTable("FUNCNO,Comment,CNO\r\n2,前進,5\r\n");
    assert.equal(rows.length, 1);
    assert.equal(rows[0][C.CI.Comment], "前進");
    assert.equal(rows[0][C.CI.FUNCNO], "2");
    assert.equal(rows[0][C.CI.CNO], "5");
  });
});

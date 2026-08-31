import { describe, expect, it } from "vitest";
import { extractForms, extractLinks, extractScriptSrcs } from "./html-extract";

describe("extractLinks", () => {
  it("extracts hrefs from anchor tags", () => {
    const html = `<a href="/about">About</a> <a href='/contact'>Contact</a>`;
    expect(extractLinks(html)).toEqual(["/about", "/contact"]);
  });

  it("extracts hrefs from link tags", () => {
    const html = `<link rel="stylesheet" href="/styles.css">`;
    expect(extractLinks(html)).toEqual(["/styles.css"]);
  });

  it("returns an empty array for markup with no links", () => {
    expect(extractLinks("<p>no links here</p>")).toEqual([]);
  });
});

describe("extractScriptSrcs", () => {
  it("extracts script src attributes", () => {
    const html = `<script src="/app.js"></script><script src="https://cdn.example.com/lib.js"></script>`;
    expect(extractScriptSrcs(html)).toEqual(["/app.js", "https://cdn.example.com/lib.js"]);
  });

  it("does not extract an inline script's contents as a src", () => {
    expect(extractScriptSrcs(`<script>console.log("hi")</script>`)).toEqual([]);
  });
});

describe("extractForms", () => {
  it("extracts action, method, and field names from a login form", () => {
    const html = `
      <form action="/login" method="POST">
        <input type="text" name="username">
        <input type="password" name="password">
        <button type="submit">Login</button>
      </form>
    `;
    const forms = extractForms(html);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toEqual({
      action: "/login",
      method: "POST",
      fieldNames: ["username", "password"],
    });
  });

  it("defaults method to GET when omitted", () => {
    const html = `<form action="/search"><input name="q"></form>`;
    expect(extractForms(html)[0]?.method).toBe("GET");
  });

  it("leaves action undefined when omitted (submits to the current page)", () => {
    const html = `<form method="post"><input name="q"></form>`;
    expect(extractForms(html)[0]?.action).toBeUndefined();
  });

  it("extracts fields from select and textarea elements too", () => {
    const html = `
      <form action="/feedback" method="post">
        <select name="topic"><option>bug</option></select>
        <textarea name="message"></textarea>
      </form>
    `;
    expect(extractForms(html)[0]?.fieldNames).toEqual(["topic", "message"]);
  });

  it("extracts multiple independent forms on one page", () => {
    const html = `
      <form action="/search" method="get"><input name="q"></form>
      <form action="/subscribe" method="post"><input name="email"></form>
    `;
    const forms = extractForms(html);
    expect(forms).toHaveLength(2);
    expect(forms.map((f) => f.action)).toEqual(["/search", "/subscribe"]);
  });

  it("deduplicates a field name repeated within one form", () => {
    const html = `<form action="/x" method="post"><input name="tag"><input name="tag"></form>`;
    expect(extractForms(html)[0]?.fieldNames).toEqual(["tag"]);
  });
});

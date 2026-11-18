import { describe, expect, it } from "vitest";

import {
  canLinkFinanceToCompany,
  financeWorkspaceOrFilter,
  recordInFinanceWorkspace,
} from "@/lib/finance/finance-model";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ALFA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BETA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("finance workspace scope (decision 0024)", () => {
  it("an employer workspace reads its company's records and the person's own company-less ones", () => {
    expect(financeWorkspaceOrFilter({ userId: ME, companyId: ALFA })).toBe(
      `company_id.eq.${ALFA},and(company_id.is.null,created_by.eq.${ME})`,
    );
  });

  it("a personal workspace reads only the person's own company-less records", () => {
    expect(financeWorkspaceOrFilter({ userId: ME, companyId: null })).toBe(
      `and(company_id.is.null,created_by.eq.${ME})`,
    );
  });

  it("a malformed id never widens the read (fail closed)", () => {
    expect(financeWorkspaceOrFilter({ userId: "x),created_by.neq.null", companyId: ALFA })).toBeNull();
    expect(financeWorkspaceOrFilter({ userId: ME, companyId: "x,company_id.not.is.null" })).toBeNull();
  });

  it("another organization's records never show in this workspace", () => {
    const scope = { userId: ME, companyId: ALFA };
    expect(recordInFinanceWorkspace({ companyId: ALFA, createdBy: OTHER }, scope)).toBe(true);
    expect(recordInFinanceWorkspace({ companyId: null, createdBy: ME }, scope)).toBe(true);
    expect(recordInFinanceWorkspace({ companyId: BETA, createdBy: ME }, scope)).toBe(false);
    expect(recordInFinanceWorkspace({ companyId: null, createdBy: OTHER }, scope)).toBe(false);
    expect(recordInFinanceWorkspace({ companyId: ALFA, createdBy: ME }, { userId: ME, companyId: null })).toBe(false);
  });
});

describe("company link mirrors finance_company_authority_v1", () => {
  it("owners, admins and the creator may link a record to the company", () => {
    expect(canLinkFinanceToCompany({ role: "owner" })).toBe(true);
    expect(canLinkFinanceToCompany({ role: "admin" })).toBe(true);
    expect(canLinkFinanceToCompany({ role: "manager", isCreator: true })).toBe(true);
  });

  it("a manager is not offered a link the database would refuse", () => {
    expect(canLinkFinanceToCompany({ role: "manager" })).toBe(false);
    expect(canLinkFinanceToCompany({ role: "external_manager" })).toBe(false);
  });
});

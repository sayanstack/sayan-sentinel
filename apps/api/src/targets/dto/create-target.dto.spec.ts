import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateTargetRequestDto } from "./create-target.dto";

describe("CreateTargetRequestDto", () => {
  it("inherits and validates CreateTargetDto's fields alongside its own organizationId", async () => {
    const dto = plainToInstance(CreateTargetRequestDto, {
      organizationId: "org-1",
      scheme: "https",
      host: "example.com",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.organizationId).toBe("org-1");
    expect(dto.host).toBe("example.com");
  });

  it("rejects a request missing organizationId", async () => {
    const dto = plainToInstance(CreateTargetRequestDto, {
      scheme: "https",
      host: "example.com",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "organizationId")).toBe(true);
  });
});

import { NextResponse } from "next/server";

export const errorResponse = (
  code: string,
  message: string,
  status: number = 400,
) => NextResponse.json({ code, message }, { status });

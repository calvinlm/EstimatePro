import type { NextFunction, Request, Response } from "express";
import type { SetupInput } from "../schemas/setup.schemas";
import { completeSetup, isSetupRequired } from "../services/setup.service";

export async function getSetupController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const required = await isSetupRequired();
    res.status(200).json({ data: { required } });
  } catch (error) {
    next(error);
  }
}

export async function postSetupController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await completeSetup(req.body as SetupInput);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

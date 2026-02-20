import { Router } from "express";
import { getSetupController, postSetupController } from "../controllers/setup.controller";
import { validate } from "../middleware/validate";
import { setupSchema } from "../schemas/setup.schemas";

const setupRouter = Router();

setupRouter.get("/", getSetupController);
setupRouter.post("/", validate({ body: setupSchema }), postSetupController);

export { setupRouter };

import { handleStaffLoginRequest } from "../server/loginApi.js";

export default async function handler(request, response) {
  await handleStaffLoginRequest(request, response);
}

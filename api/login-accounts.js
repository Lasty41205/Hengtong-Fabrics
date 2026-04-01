import { handleLoginAccountsRequest } from "../server/loginApi.js";

export default async function handler(request, response) {
  await handleLoginAccountsRequest(request, response);
}

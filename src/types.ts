export type ParsedAuthResponse = {
  access_token: string;
  scope: string;
  state: string;
  token_type: string;
};

export type MessageDataItem = {
  value: string;
  used: boolean;
};

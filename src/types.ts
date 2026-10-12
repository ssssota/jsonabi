export interface Abi<TInput, TOutput = TInput> {
  encode: (value: TInput) => any;
  decode: (value: any) => TOutput;
}

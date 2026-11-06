/** Author-owned example: no built-in module or host modification is required. */
export default {
  manifest: {id:'author.research.counter',title:'独立研究模块',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{research:'1.0.0','text-view':'1.0.0'}},
  configSchema: {type:'object',required:['title'],properties:{title:{type:'string',minLength:1}},additionalProperties:false},
  stateSchema: {type:'object',required:['progress'],properties:{progress:{type:'integer',minimum:0,maximum:1000000}},additionalProperties:false},
  initialState: () => ({progress:0}),
  commands: {
    study: {
      schema:{type:'object',required:['amount'],properties:{amount:{type:'integer',minimum:1,maximum:1000}},additionalProperties:false},
      execute(ctx,input) {
        const next=ctx.state().progress+input.amount;
        if(next>1000000)ctx.fail('RESEARCH_LIMIT','这项研究已达到配置上限');
        ctx.write({progress:next});
        ctx.emit('research.progressed',{progress:next});
        return {progress:next};
      }
    }
  },
  queries: {render:{execute(ctx){return {title:ctx.config.title,lines:[`研究进度：${ctx.state().progress}`,'这是通过公开接口加载的外部模块。']};}}}
};

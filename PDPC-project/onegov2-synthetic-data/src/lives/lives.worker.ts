import { generatePopulation } from './generate';
import { simulateLives } from './transmission';
import type { Population } from './types';
let population: Population | null = null;
self.onmessage = ({data}) => {
  try {
    if(data.type==='generate'){
      population=generatePopulation(data.source,data.options,(completed,total)=>self.postMessage({type:'progress',phase:'Huishoudens en levens samenstellen',completed,total}));
      self.postMessage({type:'population',population});
    }else if(data.type==='simulate'){
      if(!population)throw new Error('Genereer eerst een populatie.');
      const trace=simulateLives(population,data.options,(completed,total)=>self.postMessage({type:'progress',phase:'Contacten en infecties doorrekenen',completed,total}));
      self.postMessage({type:'trace',trace});
    }else if(data.type==='restore')population=data.population;
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'De berekening is mislukt.'});}
};

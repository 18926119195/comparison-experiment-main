# 300 题人工比对汇总（按字典序）

每条以 `qid | LLM预测 | gold | 判定 | 理由` 给出。
- **EM ✓** = LLM 字符串与 gold 完全相等
- **SEM ✓** = 语义等价但颗粒度差（人名拼写、单复数、缩写、冠词、数字格式、单位等）
- **✗** = 答非所问 / 答错实体 / 答错方向

## 第 1 批（第 1-75 题）

| qid | LLM预测 | 标准答案 | 判定 | 备注 |
|---|---|---|---|---|
| hotpot_100 | Mascogos | Coahuila, Mexico | ✗ | 问地点，pred 答了族群名 Mascogos |
| hotpot_1003 | AMC Theatres | AMC Theatres | EM ✓ |  |
| hotpot_1004 | Chris Tarbell | Christopher "Chris" Tarbell | SEM ✓ | 同人名(Chris Tarbell = Christopher "Chris" Tarbell) |
| hotpot_101 | Larnelle Harris | Larnelle Harris | EM ✓ |  |
| hotpot_105 | George Raft | George Raft | EM ✓ |  |
| hotpot_1091 | Shut Up | Shut Up | EM ✓ |  |
| hotpot_1109 | Orange | orange | EM ✓ |  |
| hotpot_1154 | 6 April 1830 | 6 April 1830 | EM ✓ |  |
| hotpot_1165 | No | no | EM ✓ |  |
| hotpot_1207 | Marathon | northeastern | ✗ | 问方位区域，pred 答了具体地名 Marathon |
| hotpot_125 | Richmond River | Richmond | SEM ✓ | pred 给出完整河名 Richmond River，gold 是简略名 |
| hotpot_1297 | Ector | Ector County | SEM ✓ | pred 缺 County 后缀 |
| hotpot_1303 | Malta | Malta | EM ✓ |  |
| hotpot_1304 | Disney Interactive | yes | ✗ | yes/no 题，pred 答了 Disney Interactive (格式错误) |
| hotpot_1311 | A Bug's Life | A Bug's Life | EM ✓ |  |
| hotpot_1312 | Matthew Vaughn | Matthew Vaughn | EM ✓ |  |
| hotpot_1343 | Jesper Myrfors | Jesper Myrfors | EM ✓ |  |
| hotpot_1356 | Saints | saint | SEM ✓ | 单复数差(saint/saints) |
| hotpot_1376 | Yes | yes | EM ✓ |  |
| hotpot_1408 | Dayton Memorial Hall | First Street | ✗ | 问地点，pred 给了 Dayton Memorial Hall，gold 是 First Street |
| hotpot_1464 | Eric Bana | Eric Banadinović | SEM ✓ | 艺名 vs 全名(Eric Bana = Eric Banadinović) |
| hotpot_1465 | Bishop's Stortford | Bishop's Stortford | EM ✓ |  |
| hotpot_1477 | Creech Air Force Base | Clark County | ✗ | 问城市，pred 给了基地名 Creech AFB，gold 是 Clark County |
| hotpot_1490 | Dragon TV | Dragon TV | EM ✓ |  |
| hotpot_1511 | Adam Levine | Adam Levine | EM ✓ |  |
| hotpot_1520 | Aust-Agder | Buskerud | ✗ | 问挪威郡，pred Aust-Agder vs gold Buskerud |
| hotpot_1521 | Yes | yes | EM ✓ |  |
| hotpot_1549 | American | American | EM ✓ |  |
| hotpot_1569 | Hadrian | 24 January 76 – 10 July 138 | ✗ | 问时间，pred 给了皇帝名 Hadrian |
| hotpot_1603 | Corporate private equity, real assets, global market strategies, and investment solutions | corporate private equity, real assets, global market strategies, and investment solutions. | EM ✓ |  |
| hotpot_1612 | KWCH-DT | KWCH-DT | EM ✓ |  |
| hotpot_1614 | Saint Petersburg Conservatory | Saint Petersburg Conservatory | EM ✓ |  |
| hotpot_163 | Kelly Osbourne | Kelly Lee Osbourne | SEM ✓ | 艺名 vs 全名(Kelly Osbourne = Kelly Lee Osbourne) |
| hotpot_1642 | Eli Roth | Eli Roth | EM ✓ |  |
| hotpot_1700 | Don't Kill It | Sleepy Hollow | ✗ | pred 给了 Don't Kill It，gold 是 Sleepy Hollow (不同电影) |
| hotpot_1713 | Sam Bettley | Sam Bettley | EM ✓ |  |
| hotpot_1717 | Black Friday | the fourth Thursday | ✗ | Black Friday ≠ the fourth Thursday |
| hotpot_1753 | North Greenwich Arena | North Greenwich Arena | EM ✓ |  |
| hotpot_1771 | No | no | EM ✓ |  |
| hotpot_1796 | Venstre Reform Party | Liberal "Venstre" party | ✗ | Venstre Reform Party ≠ Liberal Venstre party |
| hotpot_1813 | Online video game | role-playing game | ✗ | Online video game ≠ role-playing game |
| hotpot_1847 | Yu-Hsia Chen | Marjorie McGinnis | ✗ | Yu-Hsia Chen ≠ Marjorie McGinnis |
| hotpot_1866 | The Visit | The Visit | EM ✓ |  |
| hotpot_1874 | Mandarin Airlines | Mandarin Airlines | EM ✓ |  |
| hotpot_1879 | Master builder | "master builder" of mid-20th century New York City | SEM ✓ | pred 含 gold 关键短语"master builder" |
| hotpot_190 | Oregon Ducks | Oregon Ducks football | SEM ✓ | 同队(gold 加 sport 后缀) |
| hotpot_191 | NBC | National Broadcasting Company | SEM ✓ | 缩写 vs 全称(NBC = National Broadcasting Company) |
| hotpot_1911 | Silvia Navarro | Silvia Navarro | EM ✓ |  |
| hotpot_1933 | Betty Cohen | Betty Cohen | EM ✓ |  |
| hotpot_1937 | NCAA Division I Football Bowl Subdivision | Division I | SEM ✓ | pred 更具体(FBS 是 Division I 子集) |
| hotpot_1939 | The Magic Band | Magic Band | SEM ✓ | 冠词差(The Magic Band ≈ Magic Band) |
| hotpot_1947 | Joseph E. Grosberg | Joseph E. Grosberg | EM ✓ |  |
| hotpot_1983 | June | June | EM ✓ |  |
| hotpot_1999 | Landry's, Inc. | Landry's | SEM ✓ | 同公司(gold 省略 Inc.) |
| hotpot_2008 | A controversial public figure | both a lauded intellectual and a controversial public figure | SEM ✓ | pred 含 gold 关键短语"controversial public figure" |
| hotpot_201 | Salford City | Salford City Football Club | SEM ✓ | 同队(gold 加 Football Club 后缀) |
| hotpot_2020 | Colomac Mine | The Colomac Mine | SEM ✓ | 冠词差(The Colomac Mine ≈ Colomac Mine) |
| hotpot_2073 | Lakshmibai | Lakshmibai, the Rani of Jhansi | SEM ✓ | 同人(全名) |
| hotpot_2135 | No | no | EM ✓ |  |
| hotpot_215 | Birmingham | Birmingham, Alabama | SEM ✓ | 同城(全名加 Alabama) |
| hotpot_2160 | Williams College | Williams College | EM ✓ |  |
| hotpot_2174 | Todd Field | William Todd Field | SEM ✓ | 同人(全名) |
| hotpot_2183 | Discovery Zone | Discovery Zone | EM ✓ |  |
| hotpot_2189 | Johnny Bright | Johnny D. Bright | SEM ✓ | 同人(中间名首字母) |
| hotpot_2211 | People! | People! and The Carnabeats | SEM ✓ | pred 是 gold 中一个正确实体(People!) |
| hotpot_2215 | Florida Panthers | Florida Panthers | EM ✓ |  |
| hotpot_2218 | Malayalam cinema | Malayalam | SEM ✓ | pred 更具体(Malayalam cinema ≈ Malayalam) |
| hotpot_2225 | Stanley Lloyd Kaufman, Jr. | Stanley Lloyd Kaufman, Jr. | EM ✓ |  |
| hotpot_2231 | 10 | ten | SEM ✓ | 数字 10 vs ten |
| hotpot_2301 | MGM Resorts International | MGM Resorts International | EM ✓ |  |
| hotpot_2318 | Yes | yes | EM ✓ |  |
| hotpot_2323 | Stage Stores | Stage Stores | EM ✓ |  |
| hotpot_2347 | Automobile accident | in an automobile accident | SEM ✓ | 介词差(in an automobile accident) |
| hotpot_2378 | Taylor series | infinite sum of terms | ✗ | 问"如何表示函数"，pred 给了名字 Taylor 1 |
| hotpot_2390 | Walt Disney Pictures | Walt Disney Pictures | EM ✓ |  |

## 第 2 批（第 76-150 题）

| qid | LLM预测 | 标准答案 | 判定 | 备注 |
|---|---|---|---|---|
| hotpot_2394 | The Man from Snowy River II | The Man from Snowy River II | EM ✓ |  |
| hotpot_2396 | Yes | yes | EM ✓ |  |
| hotpot_241 | Paige O'Hara | Donna Paige Helmintoller | SEM ✓ | 艺名 vs 本名(Paige O'Hara = Donna Paige Helmintoller) |
| hotpot_2433 | Sick Puppies | Sick Puppies | EM ✓ |  |
| hotpot_2459 | PET | PET | EM ✓ |  |
| hotpot_2460 | Forrest Gump | Forrest Gump | EM ✓ |  |
| hotpot_2462 | Bunker Hill | Charlestown, Massachusetts | ✗ | 问城镇的地理特征，pred Bunker Hill ≠ gold Charlestown |
| hotpot_2475 | Northern Ireland | Northern Irish | SEM ✓ | 国名 vs 形容词(Northern Ireland ≈ Northern Irish) |
| hotpot_2514 | Franklin, Indiana | Franklin, Indiana | EM ✓ |  |
| hotpot_2577 | 4145 ft | 4145 ft | EM ✓ |  |
| hotpot_2623 | Princeton University and Massachusetts Institute of Technology | Princeton University and Massachusetts Institute of Technology | EM ✓ |  |
| hotpot_268 | 3,384,569 | 3,384,569 | EM ✓ |  |
| hotpot_2718 | #364 | #364 | EM ✓ |  |
| hotpot_2750 | Cymbidium | Cymbidium | EM ✓ |  |
| hotpot_2757 | William McKinley | William McKinley | EM ✓ |  |
| hotpot_2773 | Vishal Bhardwaj | Vishal Bhardwaj | EM ✓ |  |
| hotpot_2782 | Panicum | Panicum | EM ✓ |  |
| hotpot_2796 | The Riddler's Revenge | The Riddler's Revenge | EM ✓ |  |
| hotpot_282 | February | February | EM ✓ |  |
| hotpot_283 | Sacred Planet | Sacred Planet | EM ✓ |  |
| hotpot_2833 | Robert Jenrick | Robert Jenrick | EM ✓ |  |
| hotpot_2845 | Terri Nunn | Sonya Scarlet | ✗ | Terri Nunn ≠ Sonya Scarlet (谁更年轻) |
| hotpot_2876 | Fatih Ozmen | Fatih Ozmen | EM ✓ |  |
| hotpot_2879 | Captain Hans Geering | Captain Hans Geering | EM ✓ |  |
| hotpot_2880 | 1918 | 1918 | EM ✓ |  |
| hotpot_289 | Hey Pa! There's a Goat on the Roof | Hey Pa! There's a Goat on the Roof | EM ✓ |  |
| hotpot_2891 | Law Adam | Law Adam | EM ✓ |  |
| hotpot_2894 | 1928 | 1928 | EM ✓ |  |
| hotpot_2898 | Diamond Rio | Diamond Rio | EM ✓ |  |
| hotpot_291 | 8,211 | 8,211 at the 2010 census | SEM ✓ | 纯数字 vs 数字+限定语 |
| hotpot_2953 | Esperanza Spalding | Esperanza Spalding | EM ✓ |  |
| hotpot_2956 | Robert Wise | yes | ✗ | yes/no 题，pred 答了 Robert Wise |
| hotpot_2991 | Morris Canal | Morris Canal | EM ✓ |  |
| hotpot_3015 | Burny Mattinson, David Michener, John Musker, Ron Clements | Burny Mattinson, David Michener, and the team of John Musker and Ron Clements | SEM ✓ | 同人/同组(pred 列4人，gold 改用 "the team of" 改写) |
| hotpot_3030 | End of the 18th century | end of the 18th century | EM ✓ |  |
| hotpot_3065 | IFFHS World's Best Goalkeeper | IFFHS World's Best Goalkeeper | EM ✓ |  |
| hotpot_3070 | Band-e Amir National Park | Band-e Amir National Park | EM ✓ |  |
| hotpot_3104 | Loud and dirty | as loud and dirty as possible | SEM ✓ | 同短句(pred 缺 "as possible") |
| hotpot_3117 | Brent Barry | 6 ft | ✗ | 问身高，pred 答了人名 Brent Barry |
| hotpot_3162 | Minnesota | Minnesota | EM ✓ |  |
| hotpot_32 | Charles Nungesser | Charles Eugène | SEM ✓ | 同人(Charles Nungesser = Charles Eugène Nungesser) |
| hotpot_322 | 1944 | 1944 | EM ✓ |  |
| hotpot_3281 | Kill (body of water) | a body of water | EM ✓ |  |
| hotpot_3307 | Time Warner | Southern Progress Corporation | ✗ | Time Warner ≠ Southern Progress Corporation |
| hotpot_3315 | "Dr. Death" Steve Williams | "Dr. Death" Steve Williams | EM ✓ |  |
| hotpot_3323 | Arvo Pärt | Arvo Pärt | EM ✓ |  |
| hotpot_3344 | Magic Kingdom | Anaheim | ✗ | Magic Kingdom ≠ Anaheim |
| hotpot_3348 | Tool | Tool | EM ✓ |  |
| hotpot_3357 | Grigory Margulis | Gregori Aleksandrovich Margulis | SEM ✓ | 同人译名差(Grigory Margulis = Gregori Aleksandrovich Margulis) |
| hotpot_3461 | 2004 | 2004 | EM ✓ |  |
| hotpot_3476 | Niccolò Paganini | Niccolò (or Nicolò) Paganini | SEM ✓ | 同人拼写差 |
| hotpot_3514 | Charles Wesley | George Whitefield | ✗ | Charles Wesley ≠ George Whitefield |
| hotpot_3536 | Carlos Boozer | Carlos Austin Boozer Jr. | SEM ✓ | 同人(全名) |
| hotpot_3592 | Brothers | brother | SEM ✓ | 单复数差(brother/brothers) |
| hotpot_3616 | Savin Yeatman-Eiffel | Savin Yeatman-Eiffel | EM ✓ |  |
| hotpot_3629 | Roger Angell | Roger Angell | EM ✓ |  |
| hotpot_3639 | Duff Goldman | Jeffrey Adam "Duff" Goldman | SEM ✓ | 昵称 vs 本名(Duff Goldman = Jeffrey Adam "Duff" Goldman) |
| hotpot_3640 | Juan Rulfo | Juan Rulfo | EM ✓ |  |
| hotpot_3645 | Southbank | Southbank | EM ✓ |  |
| hotpot_3654 | 35,402 | 35,402 | EM ✓ |  |
| hotpot_3669 | Empire of Japan | Empire of Japan | EM ✓ |  |
| hotpot_3701 | 1252 and 1259 | 1241 until his death in 1250 | ✗ | 1252 and 1259 ≠ 1241 until his death in 1250 |
| hotpot_3707 | Port Vila | Port Vila | EM ✓ |  |
| hotpot_373 | Hot toddy | Hot toddy | EM ✓ |  |
| hotpot_3740 | Potato masher | potato masher | EM ✓ |  |
| hotpot_3762 | China | China | EM ✓ |  |
| hotpot_3789 | Mathematician | mathematician | EM ✓ |  |
| hotpot_379 | Eighth Wonder of the World | comparable to the seven Wonders of the World | ✗ | 问 criteria，pred 给了 title "Eighth Wonder" |
| hotpot_3790 | Pope John X | Pope John X | EM ✓ |  |
| hotpot_3839 | 1988 | 1988 | EM ✓ |  |
| hotpot_3898 | Bald eagle | The bald eagle | SEM ✓ | 冠词差(The bald eagle ≈ Bald eagle) |
| hotpot_391 | Lucas Grabeel | Lucas Stephen Grabeel | SEM ✓ | 同人(全名) |
| hotpot_3910 | Tom Courtenay | Sir Thomas Daniel Courtenay | SEM ✓ | 同人(艺名 vs Sir Thomas Daniel Courtenay) |
| hotpot_3936 | Trappist beer | Trappist beer | EM ✓ |  |
| hotpot_3989 | Pimp My Ride | Pimp My Ride | EM ✓ |  |

## 第 3 批（第 151-225 题）

| qid | LLM预测 | 标准答案 | 判定 | 备注 |
|---|---|---|---|---|
| hotpot_4006 | King Duncan | King Duncan | EM ✓ |  |
| hotpot_4031 | Cricket fighting | Cricket fighting | EM ✓ |  |
| hotpot_4074 | Taigan | Taigan | EM ✓ |  |
| hotpot_4091 | Marietta | Marietta | EM ✓ |  |
| hotpot_4093 | FHM | FHM | EM ✓ |  |
| hotpot_410 | Shanghai | Shanghai | EM ✓ |  |
| hotpot_4106 | John Garabedian | John H. Garabedian | SEM ✓ | 同人(中间首字母) |
| hotpot_4110 | Philadelphia Eagles | Philadelphia Eagles | EM ✓ |  |
| hotpot_4173 | ESPN College Football Friday Primetime | College Football Scoreboard | ✗ | ESPN College Football Friday Primetime ≠ College Football Scoreboard |
| hotpot_4175 | Gareth Jones | Gareth Jones | EM ✓ |  |
| hotpot_4197 | Lincoln Riley | Lincoln Riley | EM ✓ |  |
| hotpot_4241 | Them | Them | EM ✓ |  |
| hotpot_4249 | No | no | EM ✓ |  |
| hotpot_4312 | Donald Trump | Donald J. Trump's private jet | ✗ | 问飞机，pred 答了人 Donald Trump |
| hotpot_4317 | 9 | nine vertical feet | SEM ✓ | 数字 9 vs nine vertical feet |
| hotpot_4330 | Colonel Gaddafi | "Brotherly Leader" of the Great Socialist People's Libyan Arab Jamahiriya | ✗ | 问头衔，pred 答了人名 Colonel Gaddafi |
| hotpot_4334 | Christopher Guest | Christopher Haden-Guest | SEM ✓ | 同人(全名 Christopher Haden-Guest) |
| hotpot_4354 | Overijssel | Overijssel | EM ✓ |  |
| hotpot_4369 | Greek | Greek-American | ✗ | Greek ≠ Greek-American |
| hotpot_4427 | Yes | yes | EM ✓ |  |
| hotpot_4428 | Rum | cocktail | ✗ | Rum ≠ cocktail |
| hotpot_4438 | No | no | EM ✓ |  |
| hotpot_4448 | Peter Nowalk | Peter Nowalk | EM ✓ |  |
| hotpot_4473 | Moselle | Moselle | EM ✓ |  |
| hotpot_4577 | 1905 | 1905 | EM ✓ |  |
| hotpot_4582 | Unchained Memories | Unchained Memories | EM ✓ |  |
| hotpot_4596 | 5 | five books | SEM ✓ | 数字 5 vs five books |
| hotpot_4612 | Genus | genus | EM ✓ |  |
| hotpot_4670 | Pan Am Railways | Pan Am Railways | EM ✓ |  |
| hotpot_4702 | Oksana Grishuk | Oksana Grishuk | EM ✓ |  |
| hotpot_4719 | Teddy Riley | Teddy Riley | EM ✓ |  |
| hotpot_4721 | 1908 | 1908 | EM ✓ |  |
| hotpot_4733 | John le Carré | John le Carré | EM ✓ |  |
| hotpot_4780 | Missouri | Missouri | EM ✓ |  |
| hotpot_4798 | Lee Seok-hoon | Lee Seok-hoon | EM ✓ |  |
| hotpot_4804 | Wembley Stadium | Wembley | SEM ✓ | 同场地(Wembley Stadium ≈ Wembley) |
| hotpot_4834 | A priest | a priest | EM ✓ |  |
| hotpot_4841 | American comedy film | American comedy | SEM ✓ | 同类型(American comedy film ≈ American comedy) |
| hotpot_4863 | Supreme Court Judge | Supreme Court Judge | EM ✓ |  |
| hotpot_4880 | John Travolta | John Travolta | EM ✓ |  |
| hotpot_4948 | 1992 | 1992 | EM ✓ |  |
| hotpot_4950 | Gold Coast | Gold Coast in Queensland | SEM ✓ | 同地点(Gold Coast in Queensland ≈ Gold Coast) |
| hotpot_496 | Lower Manhattan | lower Manhattan | EM ✓ |  |
| hotpot_4980 | Sausalito, California | Las Vegas Strip | ✗ | Sausalito ≠ Las Vegas Strip |
| hotpot_4987 | October 21, 2016 | October 21, 2016 | EM ✓ |  |
| hotpot_4991 | 8 April 1912 | 8 April 1912 | EM ✓ |  |
| hotpot_5017 | No | Zaza Pachulia | ✗ | HotpotQA 期望实体名 Zaza Pachulia，pred 答了 No |
| hotpot_5024 | Polk County | Polk County | EM ✓ |  |
| hotpot_504 | 1964 to 1974 | 1964 to 1974 | EM ✓ |  |
| hotpot_5044 | January 15, 2016 | January 15, 2016 | EM ✓ |  |
| hotpot_5055 | Johnny Galecki | John Mark Galecki | SEM ✓ | 同人(Johnny Galecki = John Mark Galecki) |
| hotpot_5066 | 8 | 8 | EM ✓ |  |
| hotpot_5076 | Dan Crow | Dan Crow | EM ✓ |  |
| hotpot_5101 | Nearly 80 years | nearly 80 years | EM ✓ |  |
| hotpot_5118 | Suining | In 2002, Suining had a population of 658,798. | SEM ✓ | 都答出 Suining，gold 是整句 |
| hotpot_5139 | Sparafucile | Sparafucile | EM ✓ |  |
| hotpot_5239 | China | China | EM ✓ |  |
| hotpot_5307 | The Private Life of Plants | The Private Life of Plants | EM ✓ |  |
| hotpot_5309 | Jean Erdman | Jean Erdman | EM ✓ |  |
| hotpot_5364 | 100th | 100th | EM ✓ |  |
| hotpot_5406 | Edmund Barton | Sir Edmund Barton | SEM ✓ | 同人(Edmund Barton = Sir Edmund Barton) |
| hotpot_5413 | Spanish | Spanish | EM ✓ |  |
| hotpot_5421 | Chief Strategy Officer | Chief Strategy Officer | EM ✓ |  |
| hotpot_5440 | Vladimir Menshov | Vladimir Menshov | EM ✓ |  |
| hotpot_5459 | 1986 | 1986 | EM ✓ |  |
| hotpot_5503 | Postmodern | postmodern schools of thought | SEM ✓ | 同概念(postmodern ≈ postmodern schools of thought) |
| hotpot_5519 | Arthur | Richard Arthur | SEM ✓ | 同人短名 vs 全名 |
| hotpot_5521 | Council of Forty-four | the Council of Forty-four | SEM ✓ | 冠词差(the Council of Forty-four ≈ Council of Forty-four) |
| hotpot_5603 | Washington | Washington | EM ✓ |  |
| hotpot_5606 | Sarajevo | Sarajevo | EM ✓ |  |
| hotpot_5607 | Three's Company | Three's Company | EM ✓ |  |
| hotpot_5680 | David Wells | David Wells | EM ✓ |  |
| hotpot_5707 | Dutch | Dutch | EM ✓ |  |
| hotpot_5720 | May 1, 2011 | May 1, 2011 | EM ✓ |  |
| hotpot_5749 | Lysiloma | Lysiloma | EM ✓ |  |

## 第 4 批（第 226-300 题）

| qid | LLM预测 | 标准答案 | 判定 | 备注 |
|---|---|---|---|---|
| hotpot_5750 | Wes Craven | Wes Craven | EM ✓ |  |
| hotpot_5764 | James Mitchum | James Mitchum | EM ✓ |  |
| hotpot_5769 | Invader (Invasor) | "Invader (Invasor)" | SEM ✓ | 引号差 |
| hotpot_5790 | MedStar Washington Hospital Center | MedStar Washington Hospital Center | EM ✓ |  |
| hotpot_5810 | 1500 metres | 1500 metres | EM ✓ |  |
| hotpot_5854 | Battle of Fredericksburg | Battle of Fredericksburg | EM ✓ |  |
| hotpot_5871 | Cartoon Network Too | Cartoon Network Too | EM ✓ |  |
| hotpot_5914 | Kentucky River | Kentucky River | EM ✓ |  |
| hotpot_5957 | Peter Kay's Car Share | Peter Kay's Car Share | EM ✓ |  |
| hotpot_5973 | Julie Taymor | Julie Taymor | EM ✓ |  |
| hotpot_5987 | City of Peace | the City of Peace | SEM ✓ | 冠词差 |
| hotpot_6021 | Actress and model | model | SEM ✓ | pred 含 gold 答案 model |
| hotpot_6040 | The Wind in the Willows | The Wind in the Willows | EM ✓ |  |
| hotpot_6053 | 26,000 | 26,000 | EM ✓ |  |
| hotpot_6080 | 44 | 44 | EM ✓ |  |
| hotpot_6107 | Adelaide City | Adelaide City | EM ✓ |  |
| hotpot_6115 | The Cleveland Press | Cleveland Press | SEM ✓ | 冠词差 |
| hotpot_6152 | James Weldon Johnson | James Weldon Johnson | EM ✓ |  |
| hotpot_6213 | Steve Tisch | Mitchell Block and Michael Sarnoski | ✗ | Steve Tisch ≠ Mitchell Block and Michael Sarnoski |
| hotpot_6248 | Clayton County | Clayton County, Georgia, United States | SEM ✓ | 同县(全名加州名) |
| hotpot_627 | Zachary Levi | Zachary Levi | EM ✓ |  |
| hotpot_6271 | Washington Huskies | Washington Huskies | EM ✓ |  |
| hotpot_6274 | 1961 | 1961 | EM ✓ |  |
| hotpot_6313 | England | England | EM ✓ |  |
| hotpot_6330 | Pierre Boulez | Pierre Louis Joseph Boulez | SEM ✓ | 同人(Pierre Boulez = Pierre Louis Joseph Boulez) |
| hotpot_6346 | Howard University Hospital | Howard University Hospital | EM ✓ |  |
| hotpot_6376 | Axl Rose | Axl Rose | EM ✓ |  |
| hotpot_6466 | 26 June 2013 | 26 June 2013 | EM ✓ |  |
| hotpot_6467 | No | no | EM ✓ |  |
| hotpot_6468 | Chimpanzee | Chimpanzees | SEM ✓ | 单复数(Chimpanzee/Chimpanzees) |
| hotpot_6470 | Colorado Rockies | Colorado Rockies | EM ✓ |  |
| hotpot_6471 | Watford Football Club | Watford Football Club | EM ✓ |  |
| hotpot_6473 | 1883 | 1883 | EM ✓ |  |
| hotpot_6521 | Francis Schaeffer | Francis Schaeffer | EM ✓ |  |
| hotpot_6568 | La jolie fille de Perth | La jolie fille de Perth "(The Fair Maid of Perth)" is an opera in four acts | SEM ✓ | pred 是 gold 关键实体 |
| hotpot_6646 | Published campaign setting | published campaign settings | SEM ✓ | 单复数 |
| hotpot_6654 | Kramer | Kramer Guitars | SEM ✓ | pred 是 gold 关键实体(Kramer 是 Kramer Guitars) |
| hotpot_6693 | Japan | Japanese | SEM ✓ | 国名 vs 形容词(Japan ≈ Japanese) |
| hotpot_6718 | Long Island | Long Island | EM ✓ |  |
| hotpot_6773 | Genera | flowering plants | ✗ | Genera (分类学名) ≠ flowering plants |
| hotpot_6789 | Oklahoma Sooners | Oklahoma Sooners men's basketball | SEM ✓ | 同队(Oklahoma Sooners 是 Oklahoma Sooners men's basketball) |
| hotpot_6826 | Yes | yes | EM ✓ |  |
| hotpot_6831 | Arendelle | Arendelle | EM ✓ |  |
| hotpot_6872 | Gettysburg Address | Gettysburg Address | EM ✓ |  |
| hotpot_6883 | Maquis | rural | SEM ✓ | Maquis 是 rural 的具体化形式 |
| hotpot_6902 | The Rebirth | The Rebirth | EM ✓ |  |
| hotpot_6904 | Woolworth Building | Woolworth Building | EM ✓ |  |
| hotpot_6919 | Barack Obama | Barack Obama | EM ✓ |  |
| hotpot_6933 | Noori | Noori | EM ✓ |  |
| hotpot_6981 | Queensland | Victoria | ✗ | Queensland ≠ Victoria |
| hotpot_6995 | Joshua Rowley | Joshua Rowley | EM ✓ |  |
| hotpot_7014 | Brittany Snow | Brittany Snow | EM ✓ |  |
| hotpot_7027 | Saint Paul | Saint Paul | EM ✓ |  |
| hotpot_7065 | Chow Tai Fook Enterprises | Chow Tai Fook Enterprises | EM ✓ |  |
| hotpot_7084 | Boundary river | boundary river | EM ✓ |  |
| hotpot_7097 | Fran | Fran | EM ✓ |  |
| hotpot_7144 | University of California, Santa Barbara | University of California, Santa Barbara | EM ✓ |  |
| hotpot_7174 | Steve Coogan | Stephen John Coogan | SEM ✓ | 同人(Steve Coogan = Stephen John Coogan) |
| hotpot_720 | Organ | an organ | SEM ✓ | 冠词差 |
| hotpot_7227 | Kevin Peter Hall | Kevin Peter Hall | EM ✓ |  |
| hotpot_7230 | Kristin Hersh | Kristin Hersh | EM ✓ |  |
| hotpot_7232 | Hector Berlioz | Louis-Hector Berlioz | SEM ✓ | 同人(Hector Berlioz = Louis-Hector Berlioz) |
| hotpot_7251 | 1,840 | 1,840 students | SEM ✓ | 同数字(1,840 = 1,840 students) |
| hotpot_7325 | Division II | NCAA Division II | SEM ✓ | Division II = NCAA Division II |
| hotpot_7358 | Public airport | public | SEM ✓ | pred 更具体 |
| hotpot_7359 | Watertown | Watertown, New York | SEM ✓ | 同城(Watertown = Watertown, New York) |
| hotpot_737 | The Big Bang Theory | "The Big Bang Theory" | SEM ✓ | 引号差 |
| hotpot_738 | McLaren Vale | McLaren Vale | EM ✓ |  |
| hotpot_752 | No | no | EM ✓ |  |
| hotpot_844 | Highwayman | Highwayman | EM ✓ |  |
| hotpot_871 | Giuseppe Verdi | Giuseppe Verdi | EM ✓ |  |
| hotpot_872 | Warrington | Warrington | EM ✓ |  |
| hotpot_930 | Charlie Murphy | Charlie Murphy | EM ✓ |  |
| hotpot_948 | Hindi | Hindi | EM ✓ |  |
| hotpot_984 | David Dunn | David Dunn | EM ✓ |  |

---

## 总计

| 判定 | 题数 | 占比 |
|---|---|---|
| EM ✓ (字符串相等) | 197 | 65.67% |
| SEM ✓ (语义相等) | 71 | 23.67% |
| ✗ (答错) | 32 | 10.67% |
| **语义正确 (EM+SEM)** | **268** | **89.33%** |
import datetime
import math
import os
import sys
import calendar
import argparse
import csv
import matplotlib.pyplot as plt
from dataclasses import dataclass, field
from typing import List, Optional

# This script is a Python conversion of the provided C# TidePred.cs.
# It generates an annual tidal prediction report based on harmonic parameters.

# 對應 C# TideParam class
@dataclass
class TideParam:
    """資料類別，用於儲存潮汐調和分析參數。"""
    param_year: int = 0
    h0: float = 0.0  # 平均潮位 (cm)
    tide_name: List[str] = field(default_factory=list)
    cj: List[float] = field(default_factory=list)
    sj: List[float] = field(default_factory=list)
    sub_tide_period: List[float] = field(default_factory=list) # 週期 (hours)

# 對應 C# TidePredClass
class TidePred:
    """處理潮汐預測計算的核心類別。"""

    def __init__(self):
        self.tp = TideParam()
        self.no_of_sub_tide: int = 0

    def read_tide_params(self, fn: str) -> int:
        """
        從指定的檔案讀取調和參數。
        對應 C# ReadTideParams。
        """
        try:
            with open(fn, 'r', encoding='utf-8') as sr:
                lines = sr.readlines()

            # 初始化列表
            self.tp.tide_name = []
            self.tp.cj = []
            self.tp.sj = []
            self.tp.sub_tide_period = []

            data_start_index = -1

            for i, line in enumerate(lines):
                # 尋找並解析觀測年份
                if "Observed Year" in line:
                    # 年份在下一行
                    if i + 1 < len(lines):
                        year_str = lines[i+1].strip()
                        self.tp.param_year = int(year_str)
                
                # 尋找並解析分潮數和平均潮位
                elif "分潮數" in line and "平均潮位(CM)" in line:
                    # 資料在下一行
                    if i + 1 < len(lines):
                        parts = lines[i+1].strip().split()
                        if len(parts) >= 2:
                            self.no_of_sub_tide = int(parts[0])
                            self.tp.h0 = float(parts[1])
                
                # 尋找分潮資料表格的起始位置
                elif "Cj(CM)" in line and "Sj(CM)" in line:
                    data_start_index = i + 1
                    break # 找到表頭後就可以停止初步掃描
            
            if data_start_index != -1 and self.no_of_sub_tide > 0:
                # 從資料起始行開始讀取指定數量的分潮
                for i in range(self.no_of_sub_tide):
                    line_index = data_start_index + i
                    if line_index < len(lines):
                        s = lines[line_index].strip()
                        parts = [p for p in s.split(' ') if p]
                        if len(parts) >= 6:
                            self.tp.tide_name.append(parts[0])
                            self.tp.sub_tide_period.append(float(parts[1]))
                            # parts[2] is amplitude, parts[3] is angle
                            self.tp.cj.append(float(parts[4]))
                            self.tp.sj.append(float(parts[5]))
            
            # 驗證是否成功讀取
            if self.tp.param_year == 0 or self.no_of_sub_tide == 0 or not self.tp.tide_name:
                raise ValueError("未能從檔案中完整讀取所有必要的參數。")
            
            return 0
        except FileNotFoundError:
            print(f"錯誤: 找不到檔案 {fn}")
            return -1
        except (ValueError, IndexError) as e:
            print(f"錯誤: 解析檔案 {fn} 時發生錯誤: {e}")
            return -1

    def print_cj_sj(self) -> str:
        """
        格式化已讀取的參數以供檢視。
        對應 C# PrintCjSj。
        """
        ss = []
        s = f"* Results of Harmonic Analysis\n"
        s += f"* Today : {datetime.datetime.now():%Y/%m/%d %H:%M:%S}\n"
        ss.append(s)
        s = "* ParamYear\n"
        s += f"{self.tp.param_year:8d}\n"
        ss.append(s)
        s = "*\n"
        s += "*M     AVERAGE WATER LEVEL IN CM\n"
        s += "* 分潮    週期(HOURS)   振幅(CM)  相位角(rad)    Cj(CM) Sj(CM)\n"
        ss.append(s)
        s = f"{self.no_of_sub_tide:8d}{self.tp.h0:12.4f}\n"
        ss.append(s)

        for i in range(self.no_of_sub_tide):
            am = math.sqrt(self.tp.cj[i]**2 + self.tp.sj[i]**2)
            angle = math.atan2(self.tp.sj[i], self.tp.cj[i])
            
            s = f"{self.tp.tide_name[i]:>8}"
            s += f"{self.tp.sub_tide_period[i]:12.4f}"
            s += f"{am:12.4f}"
            s += f"{angle:12.4f}"
            s += f"{self.tp.cj[i]:12.4f}"
            s += f"{self.tp.sj[i]:12.4f}\n"
            ss.append(s)
        
        return "".join(ss)

    def tidal_pred(self, tb: datetime.datetime) -> float:
        """
        預測給定時間的潮位。
        對應 C# TidalPred。
        """
        yr = tb.year
        shift_time = self.hours_to_zero(self.tp.param_year, yr)

        yuan_dan_xt = datetime.datetime(yr, 1, 1, 0, 0) - datetime.timedelta(hours=1)

        ts = tb - yuan_dan_xt
        t0 = ts.total_seconds() / 3600.0

        # 將結果從 cm 轉換為 m
        h_tmp = 0.01 * self.h_tide_comp(self.no_of_sub_tide, t0 + shift_time)
        return h_tmp

    def h_tide_comp(self, m: int, t: float) -> float:
        """
        執行調和分析的加總計算。
        對應 C# HTideComp。
        """
        total = self.tp.h0
        for i in range(m):
            angle = 2 * math.pi * t / self.tp.sub_tide_period[i]
            total += self.tp.cj[i] * math.cos(angle) + self.tp.sj[i] * math.sin(angle)
        return total

    def hours_to_zero(self, ay: int, by: int) -> float:
        """
        計算兩個年份之間的小時數。
        對應 C# HoursToZero。
        """
        d = 0.0
        if by > ay:
            for i in range(ay, by):
                if calendar.isleap(i):
                    d += 366.0
                else:
                    d += 365.0
        return d * 24.0

# 對應 C# HourlyReport class
class HourlyReport:
    """產生逐時潮位預報報表。"""
    DELM_PLUS = "----+------+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+"
    DELM_MINUS = "-----------------------------------------------------------------------------------------------------------------------------------------------------------------------+"
    BLANKS = " " * 150

    def __init__(self):
        self.tide = TidePred()

    def init_report(self, param_fn: str) -> int:
        print(f"正在讀取潮汐調和參數: {param_fn}")
        code = self.tide.read_tide_params(param_fn)
        if code == -1:
            return -1
        print(self.tide.print_cj_sj())
        return code

    def get_report_title(self, sta_name: str) -> str:
        s = self.BLANKS[:75] + "====================\n"
        s += self.BLANKS[:75] + f"{sta_name}天文潮預報水位\n"
        s += self.BLANKS[:75] + "====================\n"
        return s

    def get_second_title(self, year: int, month: int, station_code: str) -> str:
        s = f"YEAR:  {year:04d} MONTH:   {month:02d}"
        s += self.BLANKS[:117]
        s += f"STA. CODE : {station_code} UNIT:    M\n"
        return s

    def month_head_string(self) -> str:
        s = "MMDD "
        for i in range(24):
            s += f"{i:6d}"
        s += "  MEAN  MAX.  MIN.\n"
        return s

    def print_annual_stage_report(self, report: List[List[float]], year: int, station_name: str, station_code: str) -> str:
        ss = []
        for i in range(1, 13):
            s = self.print_month_stage(report, year, i, station_name, station_code)
            ss.append(s)
        return "".join(ss)

    def print_month_stage(self, report: List[List[float]], year: int, month: int, station_name: str, station_code: str) -> str:
        ss = []
        start_day_of_year = (datetime.datetime(year, month, 1) - datetime.datetime(year, 1, 1)).days
        days_in_month = calendar.monthrange(year, month)[1]

        ss.append(self.get_report_title(station_name))
        ss.append(self.get_second_title(year, month, station_code))
        ss.append(self.DELM_MINUS + "\n")
        ss.append(self.month_head_string())
        ss.append(self.DELM_MINUS + "\n")

        for i in range(days_in_month):
            day_string = f"{month:02d}{i + 1:02d} "
            s = day_string + self.print_stage(report, start_day_of_year + i)
            ss.append(s)
            if i == 9 or i == 19:
                ss.append(self.DELM_PLUS + "\n")
        
        ss.append(self.DELM_MINUS + "\n")

        fmt = "TIDE PARAMETERS BY HARMONIC ANALYSYS BASE ON CWB DATA AT {0} YEAR. NO. OF PARAMETERS : {1}"
        s = fmt.format(self.tide.tp.param_year, self.tide.no_of_sub_tide)
        ss.append(s + "\n")
        s = f"GENERATED AT: {datetime.datetime.now():%Y/%m/%d} BY KSWRB"
        ss.append(s + "\n\n")

        return "".join(ss)

    def print_stage(self, report: List[List[float]], day: int) -> str:
        s = ""
        daily_data = report[day]
        sum_val = sum(daily_data)
        hmax = max(daily_data)
        hmin = min(daily_data)

        for val in daily_data:
            s += f"{val:6.2f}"
        
        avg = sum_val / 24.0
        s += f"{avg:6.2f}{hmax:6.2f}{hmin:6.2f}"
        return s + "\n"

    def generate_hourly_report(self, year: int) -> List[List[float]]:
        tb = datetime.datetime(year, 1, 1)
        days_of_year = 366 if calendar.isleap(year) else 365
        report = []
        for i in range(days_of_year):
            stage = [0.0] * 24
            d = tb + datetime.timedelta(days=i)
            for j in range(24):
                dh = d + datetime.timedelta(hours=j)
                tide_h = self.tide.tidal_pred(dh)
                stage[j] = tide_h
            report.append(stage)
        return report

def read_observations(filepath: str) -> List[dict]:
    """
    從 CSV 檔案讀取觀測到的潮汐資料 (源自 tide_analysis.py)。
    """
    observations = []
    with open(filepath, 'r', newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            try:
                # 解析時間和潮位值
                observations.append({
                    'time': datetime.datetime.strptime(row['initTime'], '%Y-%m-%d %H:%M:%S'),
                    'value': float(row['value'])
                })
            except (ValueError, KeyError):
                continue
    return observations

def calculate_rmse(observed: List[float], predicted: List[float]) -> float:
    """
    計算均方根誤差 (Root Mean Square Error, RMSE) (源自 tide_analysis.py)。
    """
    squared_errors = [(p - o)**2 for o, p in zip(observed, predicted)]
    if not squared_errors:
        return 0.0
    mean_squared_error = sum(squared_errors) / len(squared_errors)
    return math.sqrt(mean_squared_error)

def write_comparison_csv(filepath: str, data: List[dict]):
    """將觀測與預測的比較結果寫入 CSV 檔案。"""
    with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['time', 'observed', 'predicted']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    print(f"比較結果 CSV 已儲存至: {filepath}")

def plot_comparison_results(timestamps: List[datetime.datetime], observed: List[float], predicted: List[float], obs_year: int, param_year: int, station_name: str, limit: Optional[int] = None, save_path: Optional[str] = None, show: bool = True) -> None:
    """
    將觀測值與預測值繪製成圖表。
    """
    # 嘗試設定支援中文的字體
    try:
        # Windows 使用 'Microsoft JhengHei', macOS 使用 'Heiti TC', Linux 可能需安裝 'wqy-zenhei'
        plt.rcParams['font.sans-serif'] = ['Microsoft JhengHei', 'Heiti TC', 'WenQuanYi Zen Hei']
        plt.rcParams['axes.unicode_minus'] = False  # 解決負號顯示問題
    except Exception:
        print("警告：找不到支援中文的字體，圖表標題可能無法正常顯示。")

    if limit and len(timestamps) > limit:
        print(f"\n正在產生圖表... (僅顯示前 {limit} 筆資料以利觀察)")
        timestamps = timestamps[:limit]
        observed = observed[:limit]
        predicted = predicted[:limit]
    else:
        print("\n正在產生圖表...")

    # 計算圖表中所顯示資料的 RMSE
    plotted_rmse = calculate_rmse(observed, predicted)

    plt.figure(figsize=(15, 7))
    
    plt.plot(timestamps, observed, label='觀測值 (Observed)', color='blue', alpha=0.7, linewidth=1.5)
    plt.plot(timestamps, predicted, label=f'預測值 (Predicted, RMSE={plotted_rmse:.4f} m)', color='red', linestyle='--', alpha=0.8, linewidth=1.5)
    
    plt.title(f'{station_name} {obs_year}年潮位觀測值 vs. {param_year}年參數預測值', fontsize=16)
    plt.xlabel('日期 (Date)', fontsize=12)
    plt.ylabel('潮位 (m)', fontsize=12)
    plt.legend()
    plt.grid(True, which='both', linestyle='--', linewidth=0.5)
    plt.tight_layout()

    if save_path:
        # 確保儲存圖表的目錄存在
        save_dir = os.path.dirname(save_path)
        if save_dir:
            os.makedirs(save_dir, exist_ok=True)
        plt.savefig(save_path, dpi=300)
        print(f"\n圖表已儲存至: {save_path}")

    if show:
        plt.show()
    plt.close() # 關閉圖表以釋放記憶體


def output_to_text_file(year: int, content: str, output_dir: str):
    """將報告內容寫入文字檔。"""
    # 確保輸出目錄存在
    os.makedirs(output_dir, exist_ok=True)
    fn_out = os.path.join(output_dir, f"{year}_AnnualReport.txt")
    try:
        with open(fn_out, 'w', encoding='utf-8') as sw:
            sw.write(content)
        print(f"* 天文潮預報結果輸出至檔案 : {fn_out}\n")
    except IOError as e:
        print(f"寫入檔案 {fn_out} 失敗: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="根據潮汐調和參數產生年度潮汐預報報告。",
        epilog="範例用法：\npython tide_pred_py_version.py parameters/KS_2010_HarmonicParam.txt 2013 --output_dir reports"
    )
    parser.add_argument(
        "param_file",
        help="調和參數檔案的路徑"
    )
    parser.add_argument(
        "year",
        type=int,
        help="要產生預報的西元年份"
    )
    parser.add_argument(
        "--output_dir",
        default=".",
        help="儲存報告的目錄 (預設: 當前目錄)"
    )
    parser.add_argument(
        "--station_name",
        default="高雄站",
        help="報告中的測站名稱 (預設: 高雄站)"
    )
    parser.add_argument(
        "--station_code",
        default="1486",
        help="報告中的測站代碼 (預設: 1486)"
    )
    parser.add_argument(
        '--compare',
        action='store_true',
        help="與觀測資料進行比較並產生 CSV 報告"
    )
    parser.add_argument(
        '--obs_file',
        help="用於比較的觀測資料 CSV 檔案路徑 (需與 --compare 一起使用)"
    )
    parser.add_argument(
        '--plot',
        action='store_true',
        help="繪製觀測值與預測值的比較圖表 (需與 --compare 一起使用)"
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=720,
        help="設定圖表顯示的資料筆數上限 (預設: 720, 約一個月)。設為 0 表示顯示全部。"
    )
    args = parser.parse_args()

    fn = args.param_file
    if not fn or not os.path.exists(fn):
        print(f"找不到檔案: {fn}")
        sys.exit()

    report_generator = HourlyReport()
    if report_generator.init_report(fn) == -1:
        sys.exit()

    print(f"正在為 {args.year} 年產生潮位預報...")
    full_report_data = report_generator.generate_hourly_report(args.year)
    print("預報資料產生完成。")

    print("正在產生年度報表...")
    annual_report_string = report_generator.print_annual_stage_report(
        full_report_data, 
        args.year, 
        args.station_name, 
        args.station_code
    )
    print("報表產生完成。")

    output_to_text_file(args.year, annual_report_string, args.output_dir)

    # 如果指定了比較選項，則執行比較和 RMSE 計算
    if args.compare:
        if not args.obs_file:
            print("\n錯誤: 使用 --compare 時必須提供 --obs_file 參數。")
            sys.exit(1)
        if not os.path.exists(args.obs_file):
            print(f"\n錯誤: 觀測資料檔案不存在於 '{args.obs_file}'")
            sys.exit(1)

        print(f"\n正在讀取觀測資料進行比較: {args.obs_file}")
        observations = read_observations(args.obs_file)
        
        # 建立一個字典以便快速查找預測值
        predicted_map = {}
        start_date = datetime.datetime(args.year, 1, 1)
        for day_idx, daily_data in enumerate(full_report_data):
            for hour_idx, value in enumerate(daily_data):
                current_time = start_date + datetime.timedelta(days=day_idx, hours=hour_idx)
                predicted_map[current_time] = value

        # 準備用於 CSV 和 RMSE 計算的資料
        comparison_data = []
        observed_values = []
        predicted_values_for_rmse = []
        timestamps_for_plot = []

        for obs in observations:
            obs_time = obs['time']
            # 檢查觀測時間是否在預測年份內
            if obs_time.year == args.year:
                predicted_value = predicted_map.get(obs_time)
                if predicted_value is not None:
                    timestamps_for_plot.append(obs_time)
                    comparison_data.append({
                        'time': obs_time.strftime('%Y-%m-%d %H:%M:%S'),
                        'observed': obs['value'],
                        'predicted': predicted_value
                    })
                    observed_values.append(obs['value'])
                    predicted_values_for_rmse.append(predicted_value)
        
        if not comparison_data:
            print("警告: 觀測資料中沒有與預測年份相符的資料。")
        else:
            # 計算 RMSE
            rmse = calculate_rmse(observed_values, predicted_values_for_rmse)
            print(f"\n全年均方根誤差 (RMSE): {rmse:.4f} m")

            # 寫入比較 CSV 檔案
            param_base = os.path.splitext(os.path.basename(args.param_file))[0]
            obs_base = os.path.splitext(os.path.basename(args.obs_file))[0]
            base_name = f"comparison_{param_base}_vs_{obs_base}_{args.year}"
            
            # 確保輸出目錄存在
            os.makedirs(args.output_dir, exist_ok=True)

            comparison_filename = os.path.join(args.output_dir, f"{base_name}.csv")
            write_comparison_csv(comparison_filename, comparison_data)

            # 如果需要，繪製圖表
            if args.plot:
                plot_filename = os.path.join(args.output_dir, f"{base_name}.png")
                plot_limit = args.limit if args.limit > 0 else None
                plot_comparison_results(
                    timestamps=timestamps_for_plot,
                    observed=observed_values,
                    predicted=predicted_values_for_rmse,
                    obs_year=args.year,
                    param_year=report_generator.tide.tp.param_year,
                    station_name=args.station_name,
                    limit=plot_limit,
                    save_path=plot_filename,
                    show=True  # 如果使用 --plot，則總是顯示圖表
                )
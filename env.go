package main

func normalizeVarRows(list []HeaderItem) []HeaderItem {
	return mergeVariables(nil, list)
}

func normalizeEnvironment(e Environment) Environment {
	e.Name = clipRunes(e.Name, 80)
	e.Variables = normalizeVarRows(e.Variables)
	return e
}

func normalizeEnvironments(list []Environment, active string, fallback []HeaderItem) ([]Environment, string) {
	if len(list) == 0 {
		return []Environment{}, ""
	}
	seen := make(map[string]int, len(list))
	out := make([]Environment, 0, len(list))
	for _, e := range list {
		e = normalizeEnvironment(e)
		if e.Name == "" {
			continue
		}
		if i, ok := seen[e.Name]; ok {
			out[i].Variables = mergeVariables(out[i].Variables, e.Variables)
			continue
		}
		seen[e.Name] = len(out)
		out = append(out, e)
	}
	active = clipRunes(active, 80)
	if _, ok := seen[active]; !ok {
		active = out[0].Name
	}
	return out, active
}

func activeEnvVars(envs []Environment, active string) []HeaderItem {
	for _, e := range envs {
		if e.Name == active {
			return e.Variables
		}
	}
	if len(envs) > 0 {
		return envs[0].Variables
	}
	return nil
}

func setEnvVariables(envs []Environment, active string, rows []HeaderItem) []Environment {
	rows = normalizeVarRows(rows)
	for i, e := range envs {
		if e.Name == active {
			envs[i].Variables = rows
			return envs
		}
	}
	if len(envs) == 0 {
		return envs
	}
	envs[0].Variables = rows
	return envs
}

func mergeEnvironments(dst, src []Environment) []Environment {
	dst, _ = normalizeEnvironments(dst, "", nil)
	src, _ = normalizeEnvironments(src, "", nil)
	byName := make(map[string]int, len(dst)+len(src))
	out := make([]Environment, 0, len(dst)+len(src))
	for _, e := range dst {
		byName[e.Name] = len(out)
		out = append(out, e)
	}
	for _, e := range src {
		if i, ok := byName[e.Name]; ok {
			out[i].Variables = mergeVariables(out[i].Variables, e.Variables)
			continue
		}
		byName[e.Name] = len(out)
		out = append(out, e)
	}
	return out
}

func finishProfileEnvs(p Profile) Profile {
	p.Environments, p.ActiveEnv = normalizeEnvironments(p.Environments, p.ActiveEnv, p.VariableList)
	if len(p.Environments) == 0 {
		p.ActiveEnv = ""
		p.VariableList = nil
		return p
	}
	if p.VariableList != nil {
		p.Environments = setEnvVariables(p.Environments, p.ActiveEnv, p.VariableList)
	}
	p.VariableList = activeEnvVars(p.Environments, p.ActiveEnv)
	return p
}
